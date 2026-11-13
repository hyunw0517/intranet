import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageType, ChatRoomType, Prisma, UserStatus } from 'src/generated/prisma/client';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { CursorArgs, CursorResult } from 'src/common/util/pagination.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatEvents } from './chat-events';
import { ChatRoomsService } from './chat-rooms.service';
import { chatMessageSelect, toChatMessage } from './chat-view';
import { CHAT_EDIT_LIMIT_MS } from './const/chat.const';
import { ChatMessageContentDto } from './dto/chat-message.dto';

type Tx = Prisma.TransactionClient;

//! 채팅 메시지 (features.md 8.4)
// - 보내기·수정·삭제는 REST로만 한다. 소켓은 커밋 후 푸시만 한다(ChatEvents).
// - 메시지는 감사 로그에 남기지 않는다. ChatMessage(삭제는 soft delete) + ChatMessageEdit(수정 전 내용)가 이력이다.
@Injectable()
export class ChatMessagesService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly chatRooms: ChatRoomsService,
        private readonly chatEvents: ChatEvents,
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

        return CursorResult( rows.map( toChatMessage ), dto );
    }

    //* 보내기
    // - 1:1에서 상대가 퇴사·비활성·삭제면 읽기 전용(403). 상대가 나간 상태면 다시 참여시킨다(이전 기록은 보이지 않음).
    // - 방의 lastMessageAt(목록 정렬)과 내 lastReadMessageId(내 메시지는 읽은 것)를 같은 트랜잭션에서 갱신한다.
    async send( userId: number, roomId: number, dto: ChatMessageContentDto ) {
        const now = new Date();

        const { message, recipients, rejoinedId } = await this.prisma.$transaction( async ( tx ) => {
            const me = await this.chatRooms.getActiveMember( tx, roomId, userId );

            const rejoinedId = me.chatRoom.type === ChatRoomType.DIRECT
                ? await this.prepareDirect( tx, roomId, userId, now )
                : null;

            const message = await tx.chatMessage.create({
                data: { chatRoomId: roomId, senderId: userId, type: ChatMessageType.TEXT, content: dto.content, createdAt: now },
                select: chatMessageSelect,
            });

            await tx.chatRoom.update( { where: { id: roomId }, data: { lastMessageAt: now } } );
            await tx.chatRoomMember.update({
                where: { chatRoomId_userId: { chatRoomId: roomId, userId } },
                data: { lastReadMessageId: message.id },
            });

            return { message: toChatMessage( message ), recipients: await this.chatRooms.activeMemberIds( tx, roomId ), rejoinedId };
        });

        if ( rejoinedId !== null ) this.chatEvents.roomUpdated( [ rejoinedId ], roomId ); // 숨겼던 방이 목록에 다시 나타남
        this.chatEvents.messageCreated( recipients, message );
        this.chatEvents.roomRead( recipients, roomId, userId, message.id ); // 보낸 사람은 읽은 것으로 (안 읽은 사람 수 계산용)

        return message;
    }

    //* 수정 - 본인 TEXT 메시지, 보낸 뒤 5분 이내. 수정 전 내용을 ChatMessageEdit에 쌓는다.
    async update( userId: number, roomId: number, messageId: number, dto: ChatMessageContentDto ) {
        const now = new Date();

        const result = await this.prisma.$transaction( async ( tx ) => {
            await this.chatRooms.getActiveMember( tx, roomId, userId );
            const before = await this.lockEditable( tx, roomId, messageId, userId, now );

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

    //* 삭제 - 본인 TEXT 메시지, 보낸 뒤 5분 이내. soft delete (원문은 DB에 남는다)
    async remove( userId: number, roomId: number, messageId: number ) {
        const now = new Date();

        const recipients = await this.prisma.$transaction( async ( tx ) => {
            await this.chatRooms.getActiveMember( tx, roomId, userId );
            await this.lockEditable( tx, roomId, messageId, userId, now );

            await tx.chatMessage.update({
                where: { id: messageId },
                data: { deleted: true, deletedAt: now, deletedId: userId },
            });

            return this.chatRooms.activeMemberIds( tx, roomId );
        });

        this.chatEvents.messageDeleted( recipients, roomId, messageId );

        return true;
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
    private async lockEditable( tx: Tx, roomId: number, messageId: number, userId: number, now: Date ) {
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

        if ( message.type !== ChatMessageType.TEXT ) {
            throw new BadRequestException( '수정·삭제할 수 없는 메시지입니다.' );
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
