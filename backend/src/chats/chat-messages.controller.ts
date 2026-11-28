import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { UserRole } from 'src/generated/prisma/client';
import { ChatMessagesService } from './chat-messages.service';
import { ChatMessageContentDto } from './dto/chat-message.dto';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 채팅 메시지 - 보내기·수정·삭제는 REST, 실시간 전달은 서버가 소켓으로 푸시
@ApiTags('Chats · Messages (채팅 메시지)')
@Controller('chats/:roomId/messages')
export class ChatMessagesController {

    constructor(
        private readonly chatMessagesService: ChatMessagesService,
    ){}

    //* 메시지 목록 (최신순, ?cursor=마지막으로 받은 id&take=)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '메시지 목록', description: '최신순 커서 페이지(cursor = 마지막으로 받은 id, id 내림차순). order는 쓰지 않는다. 참여 시점 이후 메시지만 보인다. 삭제된 메시지는 content: null, files: []로 준다(화면은 "삭제된 메시지입니다").' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
    list(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Query() query: CursorPaginationDto,
    ) {
        return this.chatMessagesService.list( userId, roomId, query );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '메시지 보내기 (텍스트)', description: '활성 참여자만. 커밋 후 활성 참여자 각자에게 message:created를 푸시한다. 1:1에서 상대가 나가 있으면 다시 참여시킨다. 상대가 재직 중이 아니면 읽기 전용이라 보낼 수 없다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패(공백뿐, 2000자 초과)' })
    @ApiForbiddenResponse({ description: '1:1 상대가 채팅을 사용할 수 없음(읽기 전용)' })
    @ApiNotFoundResponse({ description: '채팅방이 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '메시지 수정', description: '본인 텍스트 메시지만, 보낸 뒤 5분 이내(서버 시각). 수정 전 내용은 서버에 이력으로 남긴다(조회 API 없음). 화면은 "수정됨"을 표시한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 텍스트 메시지가 아님, 삭제된 메시지, 5분 지남' })
    @ApiForbiddenResponse({ description: '본인 메시지가 아님' })
    @ApiNotFoundResponse({ description: '채팅방·메시지가 없거나 참여하고 있지 않음' })
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
    @ApiOperation({ summary: '메시지 삭제 (soft delete)', description: '본인 메시지만, 보낸 뒤 5분 이내. 파일 메시지는 연결된 파일도 함께 지워 누구도 받을 수 없다(이미지 묶음은 통째로).' })
    @ApiBadRequestResponse({ description: '이미 삭제된 메시지, 5분 지남' })
    @ApiForbiddenResponse({ description: '본인 메시지가 아님' })
    @ApiNotFoundResponse({ description: '채팅방·메시지가 없거나 참여하고 있지 않음' })
    remove(
        @User('id') userId: number,
        @Param('roomId', ParseIntPipe) roomId: number,
        @Param('messageId', ParseIntPipe) messageId: number,
    ) {
        return this.chatMessagesService.remove( userId, roomId, messageId );
    }
}
