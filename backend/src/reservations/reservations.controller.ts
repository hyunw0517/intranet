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
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 시설 예약 - 수정·취소·삭제 권한(본인·관리자, 시작 전/후)은 서비스에서 예약마다 확인한다.
// 고정 경로(schedule, me, admin, recurring, bulk/cancel, bulk/time, bulk)는 ':id'보다 먼저 선언한다.
// 모듈의 controllers 배열에서도 이 컨트롤러를 마지막에 둔다. ('reservations/:id'가 'reservations/categories'를 먼저 잡지 않게)
@ApiTags('Reservations (시설 예약)')
@Controller('reservations')
export class ReservationsController {

    constructor(
        private readonly reservationsService: ReservationsService,
    ){}

    //* 시간표 (?facilityId= 또는 ?categoryId= + from·to, 최대 31일)
    @Get('schedule')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '시간표', description: 'facilityId 또는 categoryId 중 하나 + 기간 [from, to), 최대 31일. 예약 제목·예약자 이름을 모든 회원에게 공개한다. 사용 불가 기간도 함께 준다. 쿼리의 "+09:00"은 %2B로 인코딩해야 한다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, facilityId·categoryId를 둘 다 보내거나 안 보냄, 종료가 시작보다 뒤가 아님, 31일 초과' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 사용하지 않는 시설' })
    schedule(
        @User() user: Actor,
        @Query() query: ScheduleQueryDto,
    ) {
        return this.reservationsService.schedule( user, query );
    }

    //* 내 예약
    @Get('me')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 예약', description: '상태·기간(시작 시각이 [from, to))으로 거른다. 시작 시각 정렬(기본 최신순), 페이지. 취소된 예약도 나온다(삭제된 예약은 안 나온다).' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findMine(
        @User() user: Actor,
        @Query() query: MyReservationListQueryDto,
    ) {
        return this.reservationsService.findMine( user, query );
    }

    //* 전체 예약 (관리자)
    @Get('admin')
    @RequireAdmin(AdminPermission.RESERVATIONS)
    @ApiOperation({ summary: '(관리자) 전체 예약', description: '내 예약의 필터 + 시설·예약자.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findAllForAdmin( @Query() query: AdminReservationListQueryDto ) {
        return this.reservationsService.findAllForAdmin( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 상세', description: '시간표와 같이 모든 회원이 볼 수 있다.' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약' })
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.reservationsService.findOne( id );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약', description: '승인 없이 바로 확정된다. 범위는 [startAt, endAt). 분류 규칙: 하루 안(KST), 운영 요일, 운영 시간 안, 예약 단위, 최대 예약 가능 일수 이내, 지난 시각 불가. 한 시설 안에서만 시간이 겹치면 안 된다(다른 시설끼리는 겹쳐도 된다). 겹침은 트랜잭션 검사 + DB exclusion constraint로 이중으로 막는다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 사용하지 않는 시설, 분류 규칙 위반(하루 넘김·운영 요일·운영 시간·예약 단위·너무 먼 날짜·지난 시각, 메시지에 이유)' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    @ApiConflictResponse({ description: '같은 시설에 겹치는 예약 또는 사용 불가 기간이 있음 (동시 요청이 DB 제약에 걸린 경우 포함)' })
    create(
        @User() user: Actor,
        @Body() body: CreateReservationDto,
    ) {
        return this.reservationsService.create( user, body );
    }

    //* 반복 예약 → { created, skipped }
    @Post('recurring')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '반복 예약', description: '기간(KST 날짜, 종료일 포함) 중 고른 요일마다 같은 시간대로 예약을 하나씩 만든다(묶음 정보는 없음). 이미 예약된 날짜·사용 불가 기간·운영하지 않는 요일·이미 지난 시각은 건너뛰고, 응답 `{ created, skipped }`에 만든 날짜와 건너뛴 날짜(이유)를 담는다. 기간은 분류의 최대 예약 가능 일수 안에서만.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 시간 형식 오류, 종료일이 시작일보다 앞섬, 시작일이 오늘 전, 최대 예약 가능 일수 초과, 기간 안에 고른 요일이 없음, 사용하지 않는 시설, 분류 규칙 위반' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    @ApiConflictResponse({ description: '미리 검사한 뒤 저장하는 사이에 다른 요청이 같은 시간을 잡음(요청 전체 실패, 다시 시도하면 그 날짜는 건너뛴다)' })
    createRecurring(
        @User() user: Actor,
        @Body() body: CreateRecurringReservationDto,
    ) {
        return this.reservationsService.createRecurring( user, body );
    }

    //* 일괄 취소 ('bulk/cancel'은 ':id/cancel'보다 먼저 선언)
    @Patch('bulk/cancel')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 일괄 취소', description: '최대 100건. 한 건이라도 처리할 수 없으면 전체 실패(트랜잭션). 시작 전 예약만, 본인 예약(관리자는 남의 예약도). 취소는 상태만 CANCELLED로 바꾸고 기록이 남는다(그 시간은 다시 예약 가능). 관리자가 남의 예약을 취소하면 예약자에게 알린다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 취소된 예약' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약 포함' })
    @ApiConflictResponse({ description: '처리 중 예약 상태가 바뀜(새로고침 필요)' })
    bulkCancel(
        @User() user: Actor,
        @Body() body: ReservationIdsDto,
    ) {
        return this.reservationsService.bulkCancel( user, body );
    }

    //* 일괄 시간 변경 - 날짜는 그대로, 시각만 같은 시간대로 맞춘다. 한 건이라도 바꿀 수 없으면 전체 실패
    @Patch('bulk/time')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 일괄 시간 변경', description: '날짜는 예약마다 그대로 두고 시작·종료 시각(HH:mm, KST)을 모두 같은 시간대로 맞춘다. 최대 100건, 한 건이라도 바꿀 수 없으면 전체 실패. 같은 시설·같은 날짜 예약이 둘 이상 섞이면 반드시 겹치므로 400. 관리자가 바꾼 남의 예약은 예약별로 알린다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 시간 형식 오류, 같은 시설·같은 날짜 예약이 섞임, 이미 취소된 예약, 분류 규칙 위반(메시지에 어느 예약인지 표시)' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약 포함' })
    @ApiConflictResponse({ description: '겹치는 예약·사용 불가 기간(메시지에 어느 예약인지 표시), 처리 중 예약 상태가 바뀜' })
    bulkChangeTime(
        @User() user: Actor,
        @Body() body: BulkReservationTimeDto,
    ) {
        return this.reservationsService.bulkChangeTime( user, body );
    }

    //* 일괄 삭제 ('bulk'는 ':id'보다 먼저 선언) - 한 건이라도 삭제할 수 없으면 전체 실패
    @Delete('bulk')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 일괄 삭제 (soft delete)', description: '최대 100건, 한 건이라도 삭제할 수 없으면 전체 실패. 본인은 시작 전 예약만, 관리자는 지난 예약도 삭제할 수 있다. 삭제된 예약은 목록에서 숨긴다(DB에는 남음). 관리자가 남의 예약을 삭제하면 예약자에게 알린다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약(관리자 제외)' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약 포함' })
    @ApiConflictResponse({ description: '처리 중 예약 상태가 바뀜(새로고침 필요)' })
    bulkDelete(
        @User() user: Actor,
        @Body() body: ReservationIdsDto,
    ) {
        return this.reservationsService.deleteMany( user, body.ids );
    }

    @Patch(':id/cancel')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 취소', description: '일괄 취소와 같은 규칙(같은 서비스)을 한 건에 적용한다.' })
    @ApiBadRequestResponse({ description: '이미 취소된 예약' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약' })
    @ApiConflictResponse({ description: '처리 중 예약 상태가 바뀜' })
    cancel(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.reservationsService.cancel( user, id );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 수정', description: '보낸 항목만 바꾼다. 시설은 바꿀 수 없다(취소 후 다시 예약). 시간을 바꾸면 분류 규칙과 겹침을 다시 확인한다. 시작 전 예약만, 본인 예약(관리자는 남의 예약도). 관리자가 남의 예약 시간을 바꾸면 예약자에게 알린다(제목·설명만 고치면 알리지 않음).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 취소된 예약, 사용하지 않는 시설, 분류 규칙 위반' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약' })
    @ApiConflictResponse({ description: '겹치는 예약·사용 불가 기간, 처리 중 예약 상태가 바뀜' })
    update(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateReservationDto,
    ) {
        return this.reservationsService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 삭제 (soft delete)', description: '일괄 삭제와 같은 규칙(같은 서비스)을 한 건에 적용한다.' })
    @ApiForbiddenResponse({ description: '본인 예약이 아님, 시작된 예약(관리자 제외)' })
    @ApiNotFoundResponse({ description: '존재하지 않는 예약' })
    @ApiConflictResponse({ description: '처리 중 예약 상태가 바뀜' })
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.reservationsService.delete( user, id );
    }
}
