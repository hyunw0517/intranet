import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { NotificationListDto } from "./dto/notification-list.dto";
import { NotificationsService } from "./notifications.service";
import { ApiNoContentResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 내 알림 (본인 알림만 조회·읽음·삭제, 생성은 업무 서비스가 send()로 한다)
// 고정 경로('unread-count', 'read-all')를 ':id'보다 먼저 선언한다.
@ApiTags('Notifications (알림)')
@Controller('common/notifications')
export class NotificationsController {

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* 내 알림 목록 (?cursor=&take=&unreadOnly=true)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 알림 목록', description: '항상 최신순, 커서 페이지(cursor = 마지막으로 받은 id). order는 쓰지 않는다. `unreadOnly=true`면 안 읽은 알림만. id는 BigInt라 문자열로 내려간다. 알림은 만드는 쪽이 저장한 link(프론트 주소)를 가진다.' })
    findMine(
        @User() user: Pick<Users, 'id'>,
        @Query() query: NotificationListDto,
    ) {
        return this.notificationsService.findMine( user.id, query );
    }

    //* 안 읽은 알림 수
    @Get('unread-count')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '안 읽은 알림 수', description: '헤더 배지용.' })
    countUnread( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.countUnread( user.id );
    }

    //* 모두 읽음
    @Patch('read-all')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '모두 읽음' })
    markAllRead( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.markAllRead( user.id );
    }

    //* 읽은 알림 삭제 (고정 경로라 ':id'보다 먼저 선언)
    @Delete('read')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '읽은 알림 모두 삭제 (물리 삭제)', description: '안 읽은 알림은 실수로 지워지지 않게 남긴다.' })
    removeRead( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.removeRead( user.id );
    }

    //* 읽음
    @Patch(':id/read')
    @Roles(UserRole.USER)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '알림 읽음', description: '이미 읽은 알림이면 그대로 둔다(readAt은 처음 읽은 시각). 본인 알림만.' })
    @ApiNoContentResponse({ description: '처리됨 (본문 없음)' })
    @ApiNotFoundResponse({ description: '내 알림 중에 없음' })
    markRead(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.notificationsService.markRead( user.id, BigInt( id ) );
    }

    //* 삭제
    @Delete(':id')
    @Roles(UserRole.USER)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: '알림 삭제 (물리 삭제)', description: '본인 알림만.' })
    @ApiNoContentResponse({ description: '삭제됨 (본문 없음)' })
    @ApiNotFoundResponse({ description: '내 알림 중에 없음' })
    remove(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.notificationsService.remove( user.id, BigInt( id ) );
    }
}
