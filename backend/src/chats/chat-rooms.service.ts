import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditActionType, AuditTargetType, ChatMessageType, ChatRoomMemberRole, ChatRoomType, FileTargetType, Prisma, UserRole, UserStatus } from 'src/generated/prisma/client';
import { AuditService, TargetAudit } from 'src/common/audit.service';
import { FilesService } from 'src/common/files.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatEvents } from './chat-events';
import { ChatMessageView, ChatUserView, chatMessageSelect, chatUserSelect, toChatMessage, toChatUser } from './chat-view';
import { CHAT_GROUP_MIN_MEMBERS, CHAT_USER_SEARCH_MAX, ChatAuditAction, directKeyOf } from './const/chat.const';
import { defaultGroupName } from './util/chat-room-name.util';
import { ChatUserSearchQueryDto, CreateGroupChatDto, InviteChatMembersDto, LeaveChatDto, OpenDirectChatDto, ReadChatDto, RenameChatRoomDto, SetMyChatRoomNameDto } from './dto/chat-room.dto';

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

//* 채팅 대상: USER 이상, ACTIVE, 삭제 안 됨 (검색과 생성·초대 검사가 같은 조건)
const chatableUserWhere = {
    deleted: false,
    status: UserStatus.ACTIVE,
    role: { in: [ UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN ] },
} satisfies Prisma.UsersWhereInput;

//! 채팅방
// - joinedAt과 메시지 createdAt에 같은 now를 넣는다. "참여 이후 메시지만" 규칙이 둘을 비교해서다.
// - 초대·내보내기·나가기는 방 행을 먼저 잠가(FOR NO KEY UPDATE) 같은 방의 변경을 차례로 처리한다.
// - 푸시는 커밋 후 보내고, 받는 사람은 커밋 직전에 읽은 활성 참여자다.
@Injectable()
export class ChatRoomsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatEvents: ChatEvents,
        private readonly filesService: FilesService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.CHAT_ROOM );
    }

    //! 공용 (메시지 서비스도 사용)

    //* 내가 활성 참여자인 방 (아니면 404, 남의 방이 있는지도 알리지 않는다)
    async getActiveMember( db: Db, roomId: number, userId: number ) {
        const member = await db.chatRoomMember.findFirst({
            where: { chatRoomId: roomId, userId, leftAt: null, chatRoom: { deleted: false } },
            select: {
                role: true,
                joinedAt: true,
                lastReadMessageId: true,
                customName: true,
                chatRoom: { select: { id: true, type: true, name: true } },
            },
        });

        if ( !member ) {
            throw new NotFoundException( '채팅방이 없거나 참여하고 있지 않습니다.' );
        }

        return member;
    }

    //* 활성 참여자 id 목록 (푸시 받는 사람)
    async activeMemberIds( db: Db, roomId: number ): Promise<number[]> {
        const members = await db.chatRoomMember.findMany({
            where: { chatRoomId: roomId, leftAt: null },
            select: { userId: true },
        });

        return members.map( ( m ) => m.userId );
    }

    //* 방 행 잠금 - 참여자 변경을 방 단위로 차례대로 처리
    // FOR NO KEY UPDATE라 메시지·참여자 INSERT의 FK 참조(KEY SHARE)와는 충돌하지 않는다.
    async lockRoom( tx: Tx, roomId: number ) {
        await tx.$queryRaw`SELECT id FROM chat_room_model WHERE id = ${roomId} FOR NO KEY UPDATE`;
    }

    //* 시스템 메시지 (생성·초대·내보내기·나가기·방장 변경) - 같은 트랜잭션에 남긴다
    async addSystemMessage( tx: Tx, roomId: number, actorId: number, content: string, now: Date ): Promise<ChatMessageView> {
        const message = await tx.chatMessage.create({
            data: { chatRoomId: roomId, senderId: actorId, type: ChatMessageType.SYSTEM, content, createdAt: now },
            select: chatMessageSelect,
        });

        await tx.chatRoom.update({ where: { id: roomId }, data: { lastMessageAt: now } });

        return toChatMessage( message );
    }

    //! 조회

    //* 내 채팅방 목록 (최근 메시지 순) + 방별 안 읽은 수
    async findMine( userId: number ) {
        const [ memberships, unread ] = await Promise.all([
            this.prisma.chatRoomMember.findMany({
                where: { userId, leftAt: null, chatRoom: { deleted: false } },
                orderBy: [ { chatRoom: { lastMessageAt: { sort: 'desc', nulls: 'last' } } }, { chatRoomId: 'desc' } ],
                select: {
                    role: true,
                    joinedAt: true,
                    customName: true,
                    chatRoom: {
                        select: {
                            id: true,
                            type: true,
                            name: true,
                            lastMessageAt: true,
                            // 1:1은 상대가 나갔어도 이름을 보여줘야 해서 나간 사람도 가져와 아래에서 거른다
                            members: { select: { userId: true, leftAt: true, user: { select: chatUserSelect } } },
                            messages: { orderBy: { id: 'desc' }, take: 1, select: chatMessageSelect },
                        },
                    },
                },
            }),
            this.unreadCounts( userId ),
        ]);

        // 마지막 메시지가 파일이면 미리보기 문구에 파일 종류가 필요해서 붙인다
        const fileMessageIds = memberships.flatMap( ( m ) => m.chatRoom.messages ).filter( ( msg ) => msg.type === ChatMessageType.FILE ).map( ( msg ) => msg.id );
        const filesByMessage = await this.filesService.listByTargets( FileTargetType.CHAT_MESSAGE, fileMessageIds );

        const directOthers = memberships.map( ( { chatRoom: room } ) =>
            room.type === ChatRoomType.DIRECT ? room.members.find( ( m ) => m.userId !== userId ) : undefined,
        );
        // 1:1 상대의 프로필 사진
        const profileImageUrls = await this.filesService.findProfileImageUrls( directOthers.flatMap( ( m ) => m ? [ m.userId ] : [] ) );

        return memberships.map( ( { role, joinedAt, customName, chatRoom: room }, i ) => {
            const last = room.messages[0];
            const activeMembers = room.members.filter( ( m ) => m.leftAt === null );
            const other = directOthers[i];

            return {
                id: room.id,
                type: room.type,
                name: room.name,                                        // 방 기본 이름 (그룹, OWNER가 정함)
                myName: customName,                                     // 나만 보는 이름 (myName ?? name ?? 1:1 상대 이름)
                otherUser: other ? toChatUser( other.user, profileImageUrls ) : null, // 1:1 상대 (그룹은 null)
                memberCount: activeMembers.length,
                myRole: role,
                lastMessage: last && last.createdAt >= joinedAt ? toChatMessage( last, filesByMessage.get( last.id ) ) : null, // 참여 전 메시지는 미리보기에도 안 보이게
                lastMessageAt: room.lastMessageAt,
                unreadCount: unread.get( room.id ) ?? 0,
            };
        });
    }

    //* 헤더 배지: 전체 안 읽은 수
    async unreadTotal( userId: number ) {
        const unread = await this.unreadCounts( userId );
        let total = 0;
        unread.forEach( ( count ) => { total += count; } );

        return { total };
    }

    //* 방별 안 읽은 수
    // 참여 이후, lastReadMessageId보다 큰 메시지 중 내 것·시스템·삭제된 메시지를 뺀 개수
    // 방마다 count를 부르지 않고 한 쿼리로 묶는다 (인덱스: chat_room_id, deleted, id DESC)
    private async unreadCounts( userId: number ): Promise<Map<number, number>> {
        const rows = await this.prisma.$queryRaw<{ roomId: number; count: number }[]>`
            SELECT m.chat_room_id AS "roomId", COUNT(*)::int AS "count"
            FROM chat_room_member_model rm
            JOIN chat_room_model r ON r.id = rm.chat_room_id AND r.deleted = false
            JOIN chat_message_model m ON m.chat_room_id = rm.chat_room_id
                AND m.id > COALESCE( rm.last_read_message_id, 0 )
                AND m.created_at >= rm.joined_at
                AND m.deleted = false
                AND m.type <> 'SYSTEM'
                AND m.sender_id IS DISTINCT FROM rm.user_id
            WHERE rm.user_id = ${userId} AND rm.left_at IS NULL
            GROUP BY m.chat_room_id
        `;

        return new Map( rows.map( ( r ) => [ r.roomId, r.count ] ) );
    }

    //* 채팅 상대 검색 (채팅할 수 있는 회원만, 본인 제외, 최대 20명)
    // 결재 애드온의 결재자 검색은 쓰지 않는다 (애드온끼리 의존하지 않게).
    async searchUsers( userId: number, dto: ChatUserSearchQueryDto ): Promise<ChatUserView[]> {
        const keyword = dto.search?.trim();

        const users = await this.prisma.users.findMany({
            where: {
                ...chatableUserWhere,
                id: { not: userId },
                ...( keyword && {
                    OR: [
                        { name: { contains: keyword, mode: 'insensitive' } },
                        { empNo: { contains: keyword, mode: 'insensitive' } },
                        { departments: { some: { deleted: false, department: { deleted: false, name: { contains: keyword, mode: 'insensitive' } } } } },
                    ],
                }),
            },
            orderBy: [ { name: 'asc' }, { id: 'asc' } ],
            take: CHAT_USER_SEARCH_MAX,
            select: chatUserSelect,
        });

        const profileImageUrls = await this.filesService.findProfileImageUrls( users.map( ( u ) => u.id ) );

        return users.map( ( u ) => toChatUser( u, profileImageUrls ) );
    }

    //* 방 상세 (메시지별 안 읽은 사람 수는 화면이 members로 계산한다)
    async findOne( userId: number, roomId: number ) {
        const me = await this.getActiveMember( this.prisma, roomId, userId );
        const room = me.chatRoom;

        const members = await this.prisma.chatRoomMember.findMany({
            where: { chatRoomId: roomId },
            orderBy: [ { joinedAt: 'asc' }, { userId: 'asc' } ],
            select: { role: true, joinedAt: true, leftAt: true, lastReadMessageId: true, user: { select: chatUserSelect } },
        });

        const activeMembers = members.filter( ( m ) => m.leftAt === null );
        const other = room.type === ChatRoomType.DIRECT ? members.find( ( m ) => m.user.id !== userId ) : undefined;
        // 참여자(나간 1:1 상대 포함)의 프로필 사진 (메시지 보낸 사람 Avatar도 쓴다)
        const profileImageUrls = await this.filesService.findProfileImageUrls( members.map( ( m ) => m.user.id ) );
        const otherUser = other ? toChatUser( other.user, profileImageUrls ) : null;

        return {
            id: room.id,
            type: room.type,
            name: room.name,
            myName: me.customName,
            myRole: me.role,
            otherUser,
            // 1:1 상대가 퇴사·비활성·삭제면 읽기 전용 (그룹은 남은 사람끼리 계속 보낸다)
            readOnly: room.type === ChatRoomType.DIRECT && !otherUser?.active,
            members: activeMembers.map( ( m ) => ({
                ...toChatUser( m.user, profileImageUrls ),
                role: m.role,
                joinedAt: m.joinedAt,
                lastReadMessageId: m.lastReadMessageId,
            }) ),
        };
    }

    //! 1:1

    //* 1:1 채팅 열기 - 두 사람당 방 하나. 있으면 그 방, 없으면 만든다.
    // 내가 나갔던 방이면 다시 참여한다. 상대가 나간 상태는 내가 보낼 때 다시 참여시킨다.
    async openDirect( userId: number, dto: OpenDirectChatDto ) {
        if ( dto.userId === userId ) {
            throw new BadRequestException( '자기 자신과는 채팅할 수 없습니다.' );
        }

        await this.findChatUsers( this.prisma, [ dto.userId ] );

        const directKey = directKeyOf( userId, dto.userId );
        const now = new Date();

        let room = await this.prisma.chatRoom.findFirst( { where: { directKey, deleted: false }, select: { id: true } } );

        if ( !room ) {
            try {
                room = await this.prisma.$transaction( async ( tx ) => {
                    const created = await tx.chatRoom.create({
                        data: {
                            type: ChatRoomType.DIRECT,
                            directKey,
                            createdId: userId,
                            members: { create: [ { userId, joinedAt: now }, { userId: dto.userId, joinedAt: now } ] },
                        },
                        select: { id: true },
                    });

                    await this.audit.created( tx, created.id, '1:1 채팅방 생성', { userIds: [ userId, dto.userId ] } );

                    return created;
                });
            } catch ( e ) {
                // 두 사람이 동시에 열면 한쪽은 directKey unique에 걸려서 먼저 만들어진 방을 쓴다
                if ( !( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ) ) throw e;

                room = await this.prisma.chatRoom.findFirstOrThrow( { where: { directKey, deleted: false }, select: { id: true } } );
            }
        } else {
            await this.prisma.chatRoomMember.updateMany({
                where: { chatRoomId: room.id, userId, leftAt: { not: null } },
                data: { leftAt: null, joinedAt: now, lastReadMessageId: null, customName: null },
            });
        }

        this.chatEvents.roomUpdated( [ userId ], room.id ); // 내 다른 탭의 목록 갱신

        return this.findOne( userId, room.id );
    }

    //! 그룹

    //* 그룹 생성 - 본인 포함 3명 이상, 만든 사람이 OWNER
    // 이름을 비우면 참여자 이름으로 한 번만 정한다 (이후 참여자가 바뀌어도 그대로).
    async createGroup( userId: number, dto: CreateGroupChatDto ) {
        const invitedIds = dto.userIds.filter( ( id ) => id !== userId );

        if ( invitedIds.length + 1 < CHAT_GROUP_MIN_MEMBERS ) {
            throw new BadRequestException( `그룹 채팅은 본인을 포함해 ${CHAT_GROUP_MIN_MEMBERS}명 이상이어야 합니다.` );
        }

        const invited = await this.findChatUsers( this.prisma, invitedIds );
        const name = dto.name ?? defaultGroupName( [ await this.userName( this.prisma, userId ), ...invited.map( ( u ) => u.name ) ] );
        const now = new Date();

        const { roomId, message } = await this.prisma.$transaction( async ( tx ) => {
            const room = await tx.chatRoom.create({
                data: {
                    type: ChatRoomType.GROUP,
                    name,
                    createdId: userId,
                    members: {
                        create: [
                            { userId, role: ChatRoomMemberRole.OWNER, joinedAt: now },
                            ...invitedIds.map( ( id ) => ({ userId: id, role: ChatRoomMemberRole.MEMBER, joinedAt: now }) ),
                        ],
                    },
                },
                select: { id: true },
            });

            const actorName = await this.userName( tx, userId );
            const message = await this.addSystemMessage( tx, room.id, userId,
                `${actorName}님이 ${joinNames( invited )}님과 채팅방을 만들었습니다.`, now );

            await this.audit.created( tx, room.id, `그룹 채팅방 생성: ${name}`, { name, userIds: [ userId, ...invitedIds ] } );

            return { roomId: room.id, message };
        });

        const memberIds = [ userId, ...invitedIds ];
        this.chatEvents.roomUpdated( memberIds, roomId );
        this.chatEvents.messageCreated( memberIds, message );

        return this.findOne( userId, roomId );
    }

    //* 초대 - 참여자 누구나. 예전에 나간 사람은 기존 행을 다시 쓴다 (이전 기록은 안 보임).
    async invite( userId: number, roomId: number, dto: InviteChatMembersDto ) {
        const invitedIds = dto.userIds.filter( ( id ) => id !== userId );

        if ( invitedIds.length === 0 ) {
            throw new BadRequestException( '초대할 회원이 없습니다.' );
        }

        const now = new Date();

        const { recipients, message } = await this.prisma.$transaction( async ( tx ) => {
            await this.lockRoom( tx, roomId );
            const me = await this.getActiveMember( tx, roomId, userId );
            this.assertGroup( me.chatRoom.type );

            const invited = await this.findChatUsers( tx, invitedIds );

            const existing = await tx.chatRoomMember.findMany({
                where: { chatRoomId: roomId, userId: { in: invitedIds } },
                select: { userId: true, leftAt: true },
            });

            if ( existing.some( ( m ) => m.leftAt === null ) ) {
                throw new BadRequestException( '이미 참여 중인 회원이 포함되어 있습니다.' );
            }

            const rejoinIds = existing.map( ( m ) => m.userId );
            const newIds = invitedIds.filter( ( id ) => !rejoinIds.includes( id ) );

            if ( rejoinIds.length > 0 ) {
                await tx.chatRoomMember.updateMany({
                    where: { chatRoomId: roomId, userId: { in: rejoinIds } },
                    data: { leftAt: null, joinedAt: now, role: ChatRoomMemberRole.MEMBER, lastReadMessageId: null, customName: null },
                });
            }

            if ( newIds.length > 0 ) {
                await tx.chatRoomMember.createMany({
                    data: newIds.map( ( id ) => ({ chatRoomId: roomId, userId: id, role: ChatRoomMemberRole.MEMBER, joinedAt: now }) ),
                });
            }

            const actorName = await this.userName( tx, userId );
            const message = await this.addSystemMessage( tx, roomId, userId, `${actorName}님이 ${joinNames( invited )}님을 초대했습니다.`, now );

            await this.audit.log({
                targetId: roomId,
                actionType: AuditActionType.UPDATE,
                content: `채팅방 초대: ${me.chatRoom.name ?? ''}`,
                detail: { action: ChatAuditAction.INVITE, userIds: invitedIds },
            }, tx );

            return { recipients: await this.activeMemberIds( tx, roomId ), message };
        });

        this.chatEvents.roomUpdated( recipients, roomId );
        this.chatEvents.messageCreated( recipients, message );

        return this.findOne( userId, roomId );
    }

    //* 내보내기 - OWNER만, 본인 제외
    async kick( userId: number, roomId: number, targetId: number ) {
        if ( targetId === userId ) {
            throw new BadRequestException( '본인은 내보낼 수 없습니다. 나가기를 사용하세요.' );
        }

        const now = new Date();

        const { recipients, message } = await this.prisma.$transaction( async ( tx ) => {
            await this.lockRoom( tx, roomId );
            const me = await this.getActiveMember( tx, roomId, userId );
            this.assertGroup( me.chatRoom.type );

            if ( me.role !== ChatRoomMemberRole.OWNER ) {
                throw new ForbiddenException( '방장만 내보낼 수 있습니다.' );
            }

            const { count } = await tx.chatRoomMember.updateMany({
                where: { chatRoomId: roomId, userId: targetId, leftAt: null },
                data: { leftAt: now },
            });

            if ( count === 0 ) {
                throw new NotFoundException( '이 채팅방에 참여하고 있지 않은 회원입니다.' );
            }

            const [ actorName, targetName ] = await Promise.all( [ this.userName( tx, userId ), this.userName( tx, targetId ) ] );
            const message = await this.addSystemMessage( tx, roomId, userId, `${actorName}님이 ${targetName}님을 내보냈습니다.`, now );

            await this.audit.log({
                targetId: roomId,
                actionType: AuditActionType.UPDATE,
                content: `채팅방 내보내기: ${me.chatRoom.name ?? ''}`,
                detail: { action: ChatAuditAction.KICK, userId: targetId },
            }, tx );

            return { recipients: await this.activeMemberIds( tx, roomId ), message };
        });

        this.chatEvents.roomRemoved( [ targetId ], roomId );
        this.chatEvents.roomUpdated( recipients, roomId );
        this.chatEvents.messageCreated( recipients, message );

        return true;
    }

    //* 나가기
    // - 1:1은 내 목록에서 숨기기만 한다. 상대가 보내거나 내가 다시 열면 다시 참여한다.
    // - 그룹 OWNER가 나가면 지정한 사람, 없으면 가장 오래 참여한 사람이 OWNER가 된다.
    // - 마지막 사람이 나가도 방과 메시지는 남긴다.
    async leave( userId: number, roomId: number, dto: LeaveChatDto ) {
        const now = new Date();

        const { recipients, messages } = await this.prisma.$transaction( async ( tx ) => {
            await this.lockRoom( tx, roomId );
            const me = await this.getActiveMember( tx, roomId, userId );
            const isGroup = me.chatRoom.type === ChatRoomType.GROUP;
            const isOwner = me.role === ChatRoomMemberRole.OWNER;

            if ( dto.nextOwnerId !== undefined && !( isGroup && isOwner ) ) {
                throw new BadRequestException( '다음 방장은 그룹 채팅방의 방장만 지정할 수 있습니다.' );
            }

            // 나간 행에 OWNER가 남지 않도록 MEMBER로 바꾼다 (다시 초대돼도 MEMBER)
            await tx.chatRoomMember.update({
                where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
                data: { leftAt: now, role: ChatRoomMemberRole.MEMBER },
            });

            let newOwnerId: number | null = null;
            const messages: ChatMessageView[] = [];

            if ( isGroup ) {
                if ( isOwner ) {
                    newOwnerId = await this.transferOwner( tx, roomId, dto.nextOwnerId );
                }

                const actorName = await this.userName( tx, userId );
                messages.push( await this.addSystemMessage( tx, roomId, userId, `${actorName}님이 나갔습니다.`, now ) );

                if ( newOwnerId !== null ) {
                    const ownerName = await this.userName( tx, newOwnerId );
                    messages.push( await this.addSystemMessage( tx, roomId, userId, `${ownerName}님이 방장이 되었습니다.`, now ) );
                }
            }

            await this.audit.log({
                targetId: roomId,
                actionType: AuditActionType.UPDATE,
                content: isGroup ? `채팅방 나가기: ${me.chatRoom.name ?? ''}` : '1:1 채팅방 나가기',
                detail: { action: ChatAuditAction.LEAVE, ...( newOwnerId !== null && { newOwnerId } ) },
            }, tx );

            return { recipients: await this.activeMemberIds( tx, roomId ), messages };
        });

        this.chatEvents.roomRemoved( [ userId ], roomId ); // 내 다른 탭
        if ( messages.length > 0 ) {
            this.chatEvents.roomUpdated( recipients, roomId );
            messages.forEach( ( message ) => this.chatEvents.messageCreated( recipients, message ) );
        }

        return true;
    }

    // 남은 활성 참여자 중 다음 OWNER를 정한다. 남은 사람이 없으면 null.
    private async transferOwner( tx: Tx, roomId: number, nextOwnerId: number | undefined ): Promise<number | null> {
        const remaining = await tx.chatRoomMember.findMany({
            where: { chatRoomId: roomId, leftAt: null },
            orderBy: [ { joinedAt: 'asc' }, { userId: 'asc' } ],
            select: { userId: true },
        });

        if ( remaining.length === 0 ) {
            if ( nextOwnerId !== undefined ) throw new BadRequestException( '방장을 넘겨받을 참여자가 없습니다.' );
            return null;
        }

        let ownerId = remaining[0].userId;

        if ( nextOwnerId !== undefined ) {
            if ( !remaining.some( ( m ) => m.userId === nextOwnerId ) ) {
                throw new BadRequestException( '다음 방장은 이 채팅방의 참여자여야 합니다.' );
            }
            ownerId = nextOwnerId;
        }

        await tx.chatRoomMember.update({
            where: { chatRoomId_userId: { chatRoomId: roomId, userId: ownerId } },
            data: { role: ChatRoomMemberRole.OWNER },
        });

        return ownerId;
    }

    //! 방 이름

    //* 방 기본 이름 변경 (그룹, OWNER만, 시스템 메시지로 알린다)
    // 방 행을 잠그는 이유: OWNER 확인과 변경 사이에 방장이 바뀌면 방장이 아닌 사람의 변경이 통과할 수 있다
    async rename( userId: number, roomId: number, dto: RenameChatRoomDto ) {
        const now = new Date();

        const result = await this.prisma.$transaction( async ( tx ) => {
            await this.lockRoom( tx, roomId );
            const me = await this.getActiveMember( tx, roomId, userId );
            this.assertGroup( me.chatRoom.type );

            if ( me.role !== ChatRoomMemberRole.OWNER ) {
                throw new ForbiddenException( '방장만 방 이름을 바꿀 수 있습니다.' );
            }

            if ( me.chatRoom.name === dto.name ) return null; // 같은 이름이면 시스템 메시지도 남기지 않는다

            await tx.chatRoom.update( { where: { id: roomId }, data: { name: dto.name } } );

            const actorName = await this.userName( tx, userId );
            const message = await this.addSystemMessage( tx, roomId, userId, `${actorName}님이 방 이름을 '${dto.name}'(으)로 바꿨습니다.`, now );

            return { recipients: await this.activeMemberIds( tx, roomId ), message };
        });

        if ( result ) {
            this.chatEvents.roomUpdated( result.recipients, roomId );
            this.chatEvents.messageCreated( result.recipients, result.message );
        }

        return this.findOne( userId, roomId );
    }

    //* 나만 보는 방 이름 (null이면 기본 이름으로)
    // 나만 보는 값이라 시스템 메시지·감사 로그 없이 내 다른 탭에만 푸시한다
    async setMyName( userId: number, roomId: number, dto: SetMyChatRoomNameDto ) {
        await this.getActiveMember( this.prisma, roomId, userId );

        await this.prisma.chatRoomMember.update({
            where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
            data: { customName: dto.name },
        });

        this.chatEvents.roomUpdated( [ userId ], roomId );

        return { myName: dto.name };
    }

    //! 읽음

    //* 여기까지 읽음 - 값은 앞으로만 움직인다 (뒤로 가는 요청은 무시)
    async markRead( userId: number, roomId: number, dto: ReadChatDto ) {
        const me = await this.getActiveMember( this.prisma, roomId, userId );

        const message = await this.prisma.chatMessage.findFirst( { where: { id: dto.messageId, chatRoomId: roomId }, select: { id: true } } );

        if ( !message ) {
            throw new NotFoundException( '이 채팅방의 메시지가 아닙니다.' );
        }

        // "더 큰 값일 때만" 조건부 UPDATE라 탭 여러 개가 동시에 보내도 뒤로 가지 않는다
        const { count } = await this.prisma.chatRoomMember.updateMany({
            where: {
                chatRoomId: roomId,
                userId,
                leftAt: null,
                OR: [ { lastReadMessageId: null }, { lastReadMessageId: { lt: message.id } } ],
            },
            data: { lastReadMessageId: message.id },
        });

        if ( count === 0 ) {
            return { lastReadMessageId: me.lastReadMessageId };
        }

        this.chatEvents.roomRead( await this.activeMemberIds( this.prisma, roomId ), roomId, userId, message.id );

        return { lastReadMessageId: message.id };
    }

    //! 내부

    private assertGroup( type: ChatRoomType ) {
        if ( type !== ChatRoomType.GROUP ) {
            throw new BadRequestException( '그룹 채팅방에서만 할 수 있습니다.' );
        }
    }

    //* 채팅할 수 있는 회원인지 (USER 이상, ACTIVE, 삭제 안 됨) - 하나라도 아니면 전체 실패
    private async findChatUsers( db: Db, ids: number[] ) {
        const users = await db.users.findMany({
            where: { id: { in: ids }, ...chatableUserWhere },
            select: { id: true, name: true },
            orderBy: { id: 'asc' },
        });

        if ( users.length !== ids.length ) {
            throw new BadRequestException( '채팅할 수 없는 회원이 포함되어 있습니다.' );
        }

        return users;
    }

    private async userName( db: Db, userId: number ) {
        const user = await db.users.findUnique( { where: { id: userId }, select: { name: true } } );
        return user?.name ?? '(알 수 없음)';
    }
}

// "홍길동, 김철수" (시스템 메시지용)
function joinNames( users: { name: string }[] ) {
    return users.map( ( u ) => u.name ).join( ', ' );
}
