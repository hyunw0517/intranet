import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { ChatRoomsService } from './chat-rooms.service';
import { ChatUserSearchQueryDto, CreateGroupChatDto, InviteChatMembersDto, LeaveChatDto, OpenDirectChatDto, ReadChatDto, RenameChatRoomDto, SetMyChatRoomNameDto } from './dto/chat-room.dto';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 채팅방 (features.md 8.3, 8.5) - 모두 USER 이상, 내가 참여한 방만 다룬다(아니면 404)
// 고정 경로(unread-count, users, direct, group)는 ':roomId'보다 먼저 선언한다.
@ApiTags('Chats · Rooms (채팅방)')
@Controller('chats')
export class ChatRoomsController {

    constructor(
        private readonly chatRoomsService: ChatRoomsService,
    ){}

    //* 내 채팅방 목록 (최근 메시지 순, 방별 안 읽은 수)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 채팅방 목록', description: '최근 메시지 순, 방별 안 읽은 수(참여 이후, 내가 보낸 것·시스템·삭제 메시지 제외)와 마지막 메시지 미리보기 포함. 나간 방은 나오지 않는다. 채팅은 REST로 보내고 받으며, 소켓은 서버 → 클라이언트 푸시만 한다(docs/api.md 5장).' })
    findMine( @User('id') userId: number ) {
        return this.chatRoomsService.findMine( userId );
    }

    //* 헤더 배지: 전체 안 읽은 수 → { total }
    @Get('unread-count')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '전체 안 읽은 수', description: '헤더 배지용 `{ total }`.' })
    unreadTotal( @User('id') userId: number ) {
        return this.chatRoomsService.unreadTotal( userId );
    }

    //* 채팅 상대 검색 (새 채팅·초대 화면) → ChatUserView[], 최대 20명
    @Get('users')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '채팅 상대 검색', description: '새 채팅·초대 화면용. USER 이상·재직·삭제되지 않은 회원, 본인 제외. 이름·사번·소속 부서명(겸직 포함), 이름순 최대 20명.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    searchUsers(
        @User('id') userId: number,
        @Query() query: ChatUserSearchQueryDto,
    ) {
        return this.chatRoomsService.searchUsers( userId, query );
    }

    //* 1:1 채팅 열기 (있으면 그 방, 없으면 생성)
    @Post('direct')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '1:1 채팅 열기', description: '두 사람당 방 하나. 이미 있으면 그 방을, 없으면 만들어 준다. 내가 나갔던 방이면 다시 참여한다(이전 기록은 보이지 않음).' })
    @ApiBadRequestResponse({ description: '자기 자신, 채팅할 수 없는 회원(재직 중인 승인 회원이 아님)' })
    openDirect(
        @User('id') userId: number,
        @Body() body: OpenDirectChatDto,
    ) {
        return this.chatRoomsService.openDirect( userId, body );
    }

    //* 그룹 채팅 생성
    @Post('group')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '그룹 채팅 생성', description: '본인 포함 3명 이상. 만든 사람이 방장. 이름을 비우면 참여자 이름으로 만든다(3명까지 쉼표, 넘으면 "외 N명"). 시스템 메시지를 남긴다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 본인 포함 3명 미만, 채팅할 수 없는 회원 포함' })
    createGroup(
        @User('id') userId: number,
        @Body() body: CreateGroupChatDto,
    ) {
        return this.chatRoomsService.createGroup( userId, body );
    }

    //* 방 상세 (참여자별 lastReadMessageId·joinedAt 포함 → 화면이 메시지별 안 읽은 사람 수 계산)
    @Get(':roomId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '채팅방 상세', description: '참여자별 lastReadMessageId·joinedAt을 함께 준다. 화면이 메시지별 안 읽은 사람 수를 계산한다(room:read 이벤트를 받으면 다시 계산). 활성 참여자만 볼 수 있고 관리자도 남의 채팅은 볼 수 없다.' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
    findOne(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
    ) {
        return this.chatRoomsService.findOne( userId, roomId );
    }

    //* 방 기본 이름 변경 (그룹, OWNER만)
    @Patch(':roomId/name')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '방 기본 이름 변경', description: '그룹만, 방장만. 모든 참여자에게 보이고 시스템 메시지를 남긴다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 그룹 채팅방이 아님' })
    @ApiForbiddenResponse({ description: '방장이 아님' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '나만 보는 방 이름', description: '참여자 누구나, 1:1·그룹 모두. 본인에게만 보인다. null·빈 문자열이면 기본 이름으로 돌아간다. 나갔다가 다시 참여하면 초기화된다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '초대', description: '그룹만, 참여자 누구나. 다시 초대된 사람은 참여 시점부터 메시지가 보인다. 시스템 메시지를 남긴다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 그룹 채팅방이 아님, 초대할 회원이 없음, 이미 참여 중인 회원 포함, 채팅할 수 없는 회원 포함' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '내보내기', description: '그룹만, 방장만(본인 제외). 시스템 메시지를 남긴다.' })
    @ApiBadRequestResponse({ description: '본인을 내보냄(나가기를 사용), 그룹 채팅방이 아님' })
    @ApiForbiddenResponse({ description: '방장이 아님' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음, 대상이 이 방의 참여자가 아님' })
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
    @ApiOperation({ summary: '나가기', description: '1:1은 내 목록에서 숨기기(상대가 보내거나 내가 다시 열면 다시 참여). 그룹 방장이 나가면 nextOwnerId에게, 지정하지 않으면 가장 오래 참여한 사람에게 방장을 넘긴다. 마지막 사람까지 나가도 방과 메시지는 남는다(방 삭제 API 없음).' })
    @ApiBadRequestResponse({ description: '방장이 아닌데 nextOwnerId 지정, 다음 방장이 이 방의 참여자가 아님, 넘겨받을 참여자가 없음' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '여기까지 읽음', description: '방을 보고 있으면 화면이 보낸다. 값은 앞으로만 움직인다(탭 여러 개가 동시에 보내도 뒤로 가지 않음). 활성 참여자에게 room:read를 푸시한다.' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음, 이 채팅방의 메시지가 아님' })
    markRead(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Body() body: ReadChatDto,
    ) {
        return this.chatRoomsService.markRead( userId, roomId, body );
    }
}
