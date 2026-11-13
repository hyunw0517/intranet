import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { ChatRoomsService } from './chat-rooms.service';
import { CreateGroupChatDto, InviteChatMembersDto, LeaveChatDto, OpenDirectChatDto, ReadChatDto, RenameChatRoomDto, SetMyChatRoomNameDto } from './dto/chat-room.dto';

//* 채팅방 (features.md 8.3, 8.5) - 모두 USER 이상, 내가 참여한 방만 다룬다(아니면 404)
// 고정 경로(unread-count, direct, group)는 ':roomId'보다 먼저 선언한다.
@Controller('chats')
export class ChatRoomsController {

    constructor(
        private readonly chatRoomsService: ChatRoomsService,
    ){}

    //* 내 채팅방 목록 (최근 메시지 순, 방별 안 읽은 수)
    @Get()
    @Roles(UserRole.USER)
    findMine( @User('id') userId: number ) {
        return this.chatRoomsService.findMine( userId );
    }

    //* 헤더 배지: 전체 안 읽은 수 → { total }
    @Get('unread-count')
    @Roles(UserRole.USER)
    unreadTotal( @User('id') userId: number ) {
        return this.chatRoomsService.unreadTotal( userId );
    }

    //* 1:1 채팅 열기 (있으면 그 방, 없으면 생성)
    @Post('direct')
    @Roles(UserRole.USER)
    openDirect(
        @User('id') userId: number,
        @Body() body: OpenDirectChatDto,
    ) {
        return this.chatRoomsService.openDirect( userId, body );
    }

    //* 그룹 채팅 생성
    @Post('group')
    @Roles(UserRole.USER)
    createGroup(
        @User('id') userId: number,
        @Body() body: CreateGroupChatDto,
    ) {
        return this.chatRoomsService.createGroup( userId, body );
    }

    //* 방 상세 (참여자별 lastReadMessageId·joinedAt 포함 → 화면이 메시지별 안 읽은 사람 수 계산)
    @Get(':roomId')
    @Roles(UserRole.USER)
    findOne(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
    ) {
        return this.chatRoomsService.findOne( userId, roomId );
    }

    //* 방 기본 이름 변경 (그룹, OWNER만)
    @Patch(':roomId/name')
    @Roles(UserRole.USER)
    rename(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: RenameChatRoomDto,
    ) {
        return this.chatRoomsService.rename( userId, roomId, body );
    }

    //* 나만 보는 방 이름 (참여자 누구나, name: null이면 기본 이름으로)
    @Patch(':roomId/my-name')
    @Roles(UserRole.USER)
    setMyName(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: SetMyChatRoomNameDto,
    ) {
        return this.chatRoomsService.setMyName( userId, roomId, body );
    }

    //* 초대 (그룹, 참여자 누구나)
    @Post(':roomId/members')
    @Roles(UserRole.USER)
    invite(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: InviteChatMembersDto,
    ) {
        return this.chatRoomsService.invite( userId, roomId, body );
    }

    //* 내보내기 (그룹, OWNER만)
    @Delete(':roomId/members/:userId')
    @Roles(UserRole.USER)
    kick(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('userId', ParseIntPipe) targetId: number,
    ) {
        return this.chatRoomsService.kick( userId, roomId, targetId );
    }

    //* 나가기 (1:1은 숨기기, 그룹 OWNER는 nextOwnerId 지정 가능)
    @Post(':roomId/leave')
    @Roles(UserRole.USER)
    leave(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: LeaveChatDto,
    ) {
        return this.chatRoomsService.leave( userId, roomId, body );
    }

    //* 여기까지 읽음
    @Post(':roomId/read')
    @Roles(UserRole.USER)
    markRead(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: ReadChatDto,
    ) {
        return this.chatRoomsService.markRead( userId, roomId, body );
    }
}
