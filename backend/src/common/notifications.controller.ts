import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Query } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { NotificationListDto } from "./dto/notification-list.dto";
import { NotificationsService } from "./notifications.service";

//* 내 알림 (본인 알림만 조회·읽음·삭제. 알림 생성은 API가 없고 업무 서비스가 NotificationsService.send()로 보낸다)
// 고정 경로('unread-count', 'read-all')를 ':id'보다 먼저 선언한다.
@Controller('common/notifications')
export class NotificationsController {

    constructor(
        private readonly notificationsService: NotificationsService,
    ){}

    //* 내 알림 목록 (?cursor=&take=&unreadOnly=true)
    @Get()
    @Roles(UserRole.USER)
    findMine(
        @User() user: Pick<Users, 'id'>,
        @Query() query: NotificationListDto,
    ) {
        return this.notificationsService.findMine( user.id, query );
    }

    //* 안 읽은 알림 수
    @Get('unread-count')
    @Roles(UserRole.USER)
    countUnread( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.countUnread( user.id );
    }

    //* 모두 읽음
    @Patch('read-all')
    @Roles(UserRole.USER)
    markAllRead( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.markAllRead( user.id );
    }

    //* 읽은 알림 삭제 (고정 경로라 ':id'보다 먼저 선언)
    @Delete('read')
    @Roles(UserRole.USER)
    removeRead( @User() user: Pick<Users, 'id'> ) {
        return this.notificationsService.removeRead( user.id );
    }

    //* 읽음
    @Patch(':id/read')
    @Roles(UserRole.USER)
    @HttpCode(HttpStatus.NO_CONTENT)
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
    remove(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.notificationsService.remove( user.id, BigInt( id ) );
    }
}
