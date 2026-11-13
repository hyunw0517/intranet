import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageType, ChatRoomType, FileTargetType, Prisma, UserStatus } from 'src/generated/prisma/client';
import { FileKind } from 'src/common/const/file.const';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { FileInfo, FilesService } from 'src/common/files.service';
import { CursorArgs, CursorResult } from 'src/common/util/pagination.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatEvents } from './chat-events';
import { ChatRoomsService } from './chat-rooms.service';
import { ChatMessageView, chatFileKind, chatMessageSelect, toChatMessage } from './chat-view';
import { CHAT_EDIT_LIMIT_MS } from './const/chat.const';
import { ChatMessageContentDto } from './dto/chat-message.dto';

type Tx = Prisma.TransactionClient;
type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof chatMessageSelect }>;

//! 채팅 메시지 (features.md 8.4)
// - 보내기·수정·삭제는 REST로만 한다. 소켓은 커밋 후 푸시만 한다(ChatEvents).
// - 메시지는 감사 로그에 남기지 않는다. ChatMessage(삭제는 soft delete) + ChatMessageEdit(수정 전 내용)가 이력이다.
// - 파일 메시지(FILE): 요청 1개 = 메시지 1개. 이미지만 여러 장을 묶고, 동영상·그 밖의 파일은 하나씩. (2026-11-13 사용자 결정)
//   파일 저장·검사·썸네일은 핵심 FilesService가 하고, 여기서는 채팅 권한(활성 참여자 + 참여 이후 + 삭제 안 됨)만 확인한다.
@Injectable()
export class ChatMessagesService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatRooms: ChatRoomsService,
        private readonly chatEvents: ChatEvents,
        private readonly filesService: FilesService,
    ){}

    //* 메시지 목록 (최신순 커서) - 참여 시점 이후만
    async list( userId: number, roomId: number, dto: CursorPaginationDto ) {
        const me = await this.chatRooms.getActiveMember( this.prisma, roomId, userId );

        const rows = await this.prisma.chatMessage.findMany({
            where: { chatRoomId: roomId, createdAt: { gte: me.joinedAt } },
            orderBy: { id: 'desc' },
            select: chatMessageSelect,
            ...CursorArgs( dto ),
        });

        return CursorResult( await this.withFiles( rows ), dto );
    }

    //* 보내기 (텍스트)
    async send( userId: number, roomId: number, dto: ChatMessageContentDto ) {
        return this.insertMessage( userId, roomId, { type: ChatMessageType.TEXT, content: dto.content } );
    }

    //* 파일 보내기 - 요청 1개 = 메시지 1개 (업로드와 메시지 생성을 한 번에)
    // - 여러 개는 이미지만(묶음 메시지). 동영상·그 밖의 파일은 화면이 하나씩 보낸다.
    //   종류·용량은 경로별 multer 옵션이 먼저 거른다(이미지 POST images 장당 20MB / 파일 POST files 200MB). 아래 검사는 한 번 더 막는 용도.
    // - 권한을 먼저 확인한 뒤 저장한다. 저장은 트랜잭션 밖(저장소 → Files 행), 연결은 메시지와 같은 트랜잭션.
    //   메시지 저장이 실패하면 올린 파일은 미연결로 남는다(게시판 첨부와 같은 정책, 정리 배치는 남은 일).
    async sendFiles( userId: number, roomId: number, files: Express.Multer.File[] | undefined ) {
        if ( !files || files.length === 0 ) {
            throw new BadRequestException( '보낼 파일이 없습니다. (form-data 필드명: files)' );
        }

        if ( files.length > 1 && files.some( ( f ) => chatFileKind( f.originalname ) !== 'image' ) ) {
            throw new BadRequestException( '여러 파일은 이미지만 한 번에 보낼 수 있습니다.' );
        }

        await this.assertCanSend( roomId, userId ); // 읽기 전용 방·남의 방이면 저장하기 전에 거절

        const saved: FileInfo[] = [];
        for ( const file of files ) {
            saved.push( await this.filesService.saveUploaded( file, FileKind.ATTACHMENT, userId, { attachmentThumbnail: true } ) );
        }

        return this.insertMessage( userId, roomId, { type: ChatMessageType.FILE, content: null }, saved );
    }

    //* 메시지 저장 공통 (텍스트·파일)
    // - 1:1에서 상대가 퇴사·비활성·삭제면 읽기 전용(403). 상대가 나간 상태면 다시 참여시킨다(이전 기록은 보이지 않음).
    // - 방의 lastMessageAt(목록 정렬)과 내 lastReadMessageId(내 메시지는 읽은 것)를 같은 트랜잭션에서 갱신한다.
    private async insertMessage(
        userId: number,
        roomId: number,
        data: { type: ChatMessageType; content: string | null },
        files: FileInfo[] = [],
    ): Promise<ChatMessageView> {
        const now = new Date();

        const { message, recipients, rejoinedId } = await this.prisma.$transaction( async ( tx ) => {
            const me = await this.chatRooms.getActiveMember( tx, roomId, userId );

            const rejoinedId = me.chatRoom.type === ChatRoomType.DIRECT
                ? await this.prepareDirect( tx, roomId, userId, now )
                : null;

            const message = await tx.chatMessage.create({
                data: { chatRoomId: roomId, senderId: userId, ...data, createdAt: now },
                select: chatMessageSelect,
            });

            // 파일 연결: 내가 올린 미연결 첨부만 (조건을 WHERE에 걸고 개수가 다르면 롤백 - FilesService.syncTargetFiles)
            if ( files.length > 0 ) {
                await this.filesService.syncTargetFiles( tx, {
                    kind: FileKind.ATTACHMENT,
                    targetType: FileTargetType.CHAT_MESSAGE,
                    targetId: message.id,
                    fileIds: files.map( ( f ) => f.id ),
                    userId,
                });
            }

            await tx.chatRoom.update( { where: { id: roomId }, data: { lastMessageAt: now } } );
            await tx.chatRoomMember.update({
                where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
                data: { lastReadMessageId: message.id },
            });

            return { message: toChatMessage( message, files ), recipients: await this.chatRooms.activeMemberIds( tx, roomId ), rejoinedId };
        });

        if ( rejoinedId !== null ) this.chatEvents.roomUpdated( [ rejoinedId ], roomId ); // 숨겼던 방이 목록에 다시 나타남
        this.chatEvents.messageCreated( recipients, message );
        this.chatEvents.roomRead( recipients, roomId, userId, message.id ); // 보낸 사람은 읽은 것으로 (안 읽은 사람 수 계산용)

        return message;
    }

    //* 수정 - 본인 TEXT 메시지, 보낸 뒤 5분 이내. 수정 전 내용을 ChatMessageEdit에 쌓는다. (파일 메시지는 수정 불가)
    async update( userId: number, roomId: number, messageId: number, dto: ChatMessageContentDto ) {
        const now = new Date();

        const result = await this.prisma.$transaction( async ( tx ) => {
            await this.chatRooms.getActiveMember( tx, roomId, userId );
            const before = await this.lockEditable( tx, roomId, messageId, userId, now, 'update' );

            if ( before.content === dto.content ) return null; // 바뀐 내용이 없으면 이력도 남기지 않는다

            await tx.chatMessageEdit.create( { data: { messageId, content: before.content ?? '', createdAt: now } } );

            const message = await tx.chatMessage.update({
                where: { id: messageId },
                data: { content: dto.content, editedAt: now },
                select: chatMessageSelect,
            });

            return { message: toChatMessage( message ), recipients: await this.chatRooms.activeMemberIds( tx, roomId ) };
        });

        if ( !result ) {
            return toChatMessage( await this.prisma.chatMessage.findUniqueOrThrow( { where: { id: messageId }, select: chatMessageSelect } ) );
        }

        this.chatEvents.messageUpdated( result.recipients, result.message );

        return result.message;
    }

    //* 삭제 - 본인 TEXT·FILE 메시지, 보낸 뒤 5분 이내. soft delete (원문은 DB에 남는다)
    // 파일 메시지는 연결된 파일도 soft delete → 다운로드·썸네일 404. 이미지 묶음은 통째로만 지운다.
    async remove( userId: number, roomId: number, messageId: number ) {
        const now = new Date();

        const recipients = await this.prisma.$transaction( async ( tx ) => {
            await this.chatRooms.getActiveMember( tx, roomId, userId );
            const message = await this.lockEditable( tx, roomId, messageId, userId, now, 'delete' );

            await tx.chatMessage.update({
                where: { id: messageId },
                data: { deleted: true, deletedAt: now, deletedId: userId },
            });

            if ( message.type === ChatMessageType.FILE ) {
                await this.filesService.softDeleteByTarget( tx, [ FileTargetType.CHAT_MESSAGE ], messageId, userId );
            }

            return this.chatRooms.activeMemberIds( tx, roomId );
        });

        this.chatEvents.messageDeleted( recipients, roomId, messageId );

        return true;
    }

    //* 파일 보관함 - 이 방에서 주고받은 파일 (최신순 커서, 파일 id 기준)
    // 보이는 범위는 메시지와 같다: 참여 시점 이후 + 메시지·파일 삭제 안 됨. 이미지 묶음은 파일마다 한 칸.
    // Files는 다형 참조(targetType + targetId)라 메시지와 relation이 없어서, 조인 한 번으로 묶는다.
    async listFiles( userId: number, roomId: number, dto: CursorPaginationDto ) {
        const me = await this.chatRooms.getActiveMember( this.prisma, roomId, userId );

        const rows = await this.prisma.$queryRaw<{ id: number; originalName: string; size: number; messageId: number; createdAt: Date; senderName: string | null }[]>`
            SELECT f.id, f.original_name AS "originalName", f.size, m.id AS "messageId", m.created_at AS "createdAt", u.name AS "senderName"
            FROM files_model f
            JOIN chat_message_model m ON m.id = f.target_id AND f.target_type = 'CHAT_MESSAGE'
            LEFT JOIN users_model u ON u.id = m.sender_id
            WHERE m.chat_room_id = ${roomId}
              AND m.deleted = false AND f.deleted = false
              AND m.created_at >= ${me.joinedAt}
              ${dto.cursor !== undefined ? Prisma.sql`AND f.id < ${dto.cursor}` : Prisma.empty}
            ORDER BY f.id DESC
            LIMIT ${dto.take + 1}
        `;

        return CursorResult( rows.map( ( r ) => ({
            id: r.id,
            name: r.originalName,
            size: r.size,
            kind: chatFileKind( r.originalName ),
            messageId: r.messageId,
            createdAt: r.createdAt,
            senderName: r.senderName,
        }) ), dto );
    }

    //* 파일 열기 (다운로드 / 썸네일)
    // 권한 = 활성 참여자 + 이 방의 메시지 + 참여 시점 이후 + 메시지·파일 삭제 안 됨. 아니면 404 (나간 사람, 재참여 전 파일 포함)
    async openFile( userId: number, roomId: number, fileId: number ) {
        const messageId = await this.findReadableFileMessage( userId, roomId, fileId );
        return this.filesService.openTargetFile( fileId, FileTargetType.CHAT_MESSAGE, messageId );
    }

    async openThumbnail( userId: number, roomId: number, fileId: number ) {
        const messageId = await this.findReadableFileMessage( userId, roomId, fileId );
        return this.filesService.openTargetThumbnail( fileId, FileTargetType.CHAT_MESSAGE, messageId );
    }

    private async findReadableFileMessage( userId: number, roomId: number, fileId: number ): Promise<number> {
        const me = await this.chatRooms.getActiveMember( this.prisma, roomId, userId );

        const file = await this.prisma.files.findFirst( {
            where: { id: fileId, targetType: FileTargetType.CHAT_MESSAGE, deleted: false },
            select: { targetId: true },
        } );

        const message = file?.targetId
            ? await this.prisma.chatMessage.findFirst( {
                where: { id: file.targetId, chatRoomId: roomId, deleted: false, createdAt: { gte: me.joinedAt } },
                select: { id: true },
            } )
            : null;

        if ( !message ) {
            throw new NotFoundException( '파일을 찾을 수 없습니다.' );
        }

        return message.id;
    }

    //* 메시지 행 → 응답 (파일 메시지는 파일 목록을 붙인다, 쿼리 1번)
    private async withFiles( rows: MessageRow[] ): Promise<ChatMessageView[]> {
        const fileMessageIds = rows.filter( ( r ) => r.type === ChatMessageType.FILE ).map( ( r ) => r.id );
        const filesByMessage = await this.filesService.listByTargets( FileTargetType.CHAT_MESSAGE, fileMessageIds );

        return rows.map( ( row ) => toChatMessage( row, filesByMessage.get( row.id ) ) );
    }

    //* 파일 저장 전 확인 - 활성 참여자이고, 1:1이면 상대가 채팅할 수 있어야 한다 (읽기 전용 방은 업로드도 막음)
    // 트랜잭션 안(insertMessage)에서 다시 확인한다. 여기서는 거절될 파일을 저장소에 쓰지 않으려는 용도.
    private async assertCanSend( roomId: number, userId: number ) {
        const me = await this.chatRooms.getActiveMember( this.prisma, roomId, userId );
        if ( me.chatRoom.type !== ChatRoomType.DIRECT ) return;

        const other = await this.prisma.chatRoomMember.findFirst({
            where: { chatRoomId: roomId, userId: { not: userId } },
            select: { user: { select: { status: true, deleted: true } } },
        });

        if ( !other || other.user.deleted || other.user.status !== UserStatus.ACTIVE ) {
            throw new ForbiddenException( '상대가 채팅을 사용할 수 없어 메시지를 보낼 수 없습니다.' );
        }
    }

    //* 1:1 보내기 전 확인 - 상대가 채팅할 수 없으면 403, 나간 상태면 다시 참여시키고 그 id를 돌려준다
    private async prepareDirect( tx: Tx, roomId: number, userId: number, now: Date ): Promise<number | null> {
        const other = await tx.chatRoomMember.findFirst({
            where: { chatRoomId: roomId, userId: { not: userId } },
            select: { userId: true, leftAt: true, user: { select: { status: true, deleted: true } } },
        });

        if ( !other || other.user.deleted || other.user.status !== UserStatus.ACTIVE ) {
            throw new ForbiddenException( '상대가 채팅을 사용할 수 없어 메시지를 보낼 수 없습니다.' );
        }

        if ( other.leftAt === null ) return null;

        // 같은 now를 joinedAt과 메시지 createdAt에 넣어, 다시 참여한 상대에게 이 메시지부터 보이게 한다
        await tx.chatRoomMember.update({
            where: { chatRoomId_userId: { chatRoomId: roomId, userId: other.userId } },
            data: { leftAt: null, joinedAt: now, lastReadMessageId: null, customName: null },
        });

        return other.userId;
    }

    //* 수정·삭제할 수 있는 메시지인지 확인 + 행 잠금 (동시에 수정하면 차례로 처리 → 수정 이력이 빠지지 않는다)
    // 수정은 TEXT만, 삭제는 TEXT·FILE (시스템 메시지는 둘 다 불가)
    private async lockEditable( tx: Tx, roomId: number, messageId: number, userId: number, now: Date, action: 'update' | 'delete' ) {
        await tx.$queryRaw`SELECT id FROM chat_message_model WHERE id = ${messageId} AND chat_room_id = ${roomId} FOR NO KEY UPDATE`;

        const message = await tx.chatMessage.findFirst({
            where: { id: messageId, chatRoomId: roomId },
            select: { senderId: true, type: true, content: true, deleted: true, createdAt: true },
        });

        if ( !message ) {
            throw new NotFoundException( '메시지가 없습니다.' );
        }

        if ( message.senderId !== userId ) {
            throw new ForbiddenException( '본인 메시지만 수정·삭제할 수 있습니다.' );
        }

        const allowed: ChatMessageType[] = action === 'update' ? [ ChatMessageType.TEXT ] : [ ChatMessageType.TEXT, ChatMessageType.FILE ];
        if ( !allowed.includes( message.type ) ) {
            throw new BadRequestException( action === 'update' ? '파일 메시지는 수정할 수 없습니다.' : '삭제할 수 없는 메시지입니다.' );
        }

        if ( message.deleted ) {
            throw new BadRequestException( '삭제된 메시지입니다.' );
        }

        if ( now.getTime() - message.createdAt.getTime() > CHAT_EDIT_LIMIT_MS ) {
            throw new BadRequestException( '보낸 뒤 5분이 지난 메시지는 수정·삭제할 수 없습니다.' );
        }

        return message;
    }
}
