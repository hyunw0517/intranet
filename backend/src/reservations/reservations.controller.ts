import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { BulkReservationTimeDto } from './dto/bulk-reservation-time.dto';
import { CreateRecurringReservationDto } from './dto/create-recurring-reservation.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AdminReservationListQueryDto, MyReservationListQueryDto } from './dto/reservation-list-query.dto';
import { ReservationIdsDto } from './dto/reservation-ids.dto';
import { ScheduleQueryDto } from './dto/schedule-query.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsService } from './reservations.service';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 시설 예약 - 수정·취소·삭제 권한(본인·관리자, 시작 전/후)은 서비스에서 예약마다 확인한다.
// 고정 경로(schedule, me, admin, recurring, bulk/cancel, bulk/time, bulk)는 ':id'보다 먼저 선언한다.
// 모듈의 controllers 배열에서도 이 컨트롤러를 마지막에 둔다. ('reservations/:id'가 'reservations/categories'를 먼저 잡지 않게)
@Controller('reservations')
export class ReservationsController {

    constructor(
        private readonly reservationsService: ReservationsService,
    ){}

    //* 시간표 (?facilityId= 또는 ?categoryId= + from·to, 최대 31일)
    @Get('schedule')
    @Roles(UserRole.USER)
    schedule(
        @User() user: Actor,
        @Query() query: ScheduleQueryDto,
    ) {
        return this.reservationsService.schedule( user, query );
    }

    //* 내 예약
    @Get('me')
    @Roles(UserRole.USER)
    findMine(
        @User() user: Actor,
        @Query() query: MyReservationListQueryDto,
    ) {
        return this.reservationsService.findMine( user, query );
    }

    //* 전체 예약 (관리자)
    @Get('admin')
    @RequireAdmin(AdminPermission.RESERVATIONS)
    findAllForAdmin( @Query() query: AdminReservationListQueryDto ) {
        return this.reservationsService.findAllForAdmin( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.reservationsService.findOne( id );
    }

    @Post()
    @Roles(UserRole.USER)
    create(
        @User() user: Actor,
        @Body() body: CreateReservationDto,
    ) {
        return this.reservationsService.create( user, body );
    }

    //* 반복 예약 → { created, skipped }
    @Post('recurring')
    @Roles(UserRole.USER)
    createRecurring(
        @User() user: Actor,
        @Body() body: CreateRecurringReservationDto,
    ) {
        return this.reservationsService.createRecurring( user, body );
    }

    //* 일괄 취소 ('bulk/cancel'은 ':id/cancel'보다 먼저 선언)
    @Patch('bulk/cancel')
    @Roles(UserRole.USER)
    bulkCancel(
        @User() user: Actor,
        @Body() body: ReservationIdsDto,
    ) {
        return this.reservationsService.bulkCancel( user, body );
    }

    //* 일괄 시간 변경 - 날짜는 그대로, 시각만 같은 시간대로 맞춘다. 한 건이라도 바꿀 수 없으면 전체 실패
    @Patch('bulk/time')
    @Roles(UserRole.USER)
    bulkChangeTime(
        @User() user: Actor,
        @Body() body: BulkReservationTimeDto,
    ) {
        return this.reservationsService.bulkChangeTime( user, body );
    }

    //* 일괄 삭제 ('bulk'는 ':id'보다 먼저 선언) - 한 건이라도 삭제할 수 없으면 전체 실패
    @Delete('bulk')
    @Roles(UserRole.USER)
    bulkDelete(
        @User() user: Actor,
        @Body() body: ReservationIdsDto,
    ) {
        return this.reservationsService.deleteMany( user, body.ids );
    }

    @Patch(':id/cancel')
    @Roles(UserRole.USER)
    cancel(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.reservationsService.cancel( user, id );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    update(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateReservationDto,
    ) {
        return this.reservationsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.reservationsService.delete( user, id );
    }
}
