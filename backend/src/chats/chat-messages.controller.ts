import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { UserRole } from 'src/generated/prisma/client';
import { ChatMessagesService } from './chat-messages.service';
import { ChatMessageContentDto } from './dto/chat-message.dto';

//* 채팅 메시지 (features.md 8.4) - 보내기·수정·삭제는 REST, 실시간 전달은 서버가 소켓으로 푸시
@Controller('chats/:roomId/messages')
export class ChatMessagesController {

    constructor(
        private readonly chatMessagesService: ChatMessagesService,
    ){}

    //* 메시지 목록 (최신순, ?cursor=마지막으로 받은 id&take=)
    @Get()
    @Roles(UserRole.USER)
    list(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Query() query: CursorPaginationDto,
    ) {
        return this.chatMessagesService.list( userId, roomId, query );
    }

    @Post()
    @Roles(UserRole.USER)
    send(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: ChatMessageContentDto,
    ) {
        return this.chatMessagesService.send( userId, roomId, body );
    }

    //* 수정 (본인, 5분 이내)
    @Patch(':messageId')
    @Roles(UserRole.USER)
    update(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('messageId', ParseIntPipe) messageId: number,
        @Body() body: ChatMessageContentDto,
    ) {
        return this.chatMessagesService.update( userId, roomId, messageId, body );
    }

    //* 삭제 (본인, 5분 이내, soft delete)
    @Delete(':messageId')
    @Roles(UserRole.USER)
    remove(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('messageId', ParseIntPipe) messageId: number,
    ) {
        return this.chatMessagesService.remove( userId, roomId, messageId );
    }
}
