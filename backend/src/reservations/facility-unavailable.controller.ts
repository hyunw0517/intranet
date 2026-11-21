import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { CreateUnavailableDto } from './dto/create-unavailable.dto';
import { UnavailableListQueryDto } from './dto/unavailable-list-query.dto';
import { UpdateUnavailableDto } from './dto/update-unavailable.dto';
import { FacilityUnavailableService } from './facility-unavailable.service';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 시설 사용 불가 기간 (관리자) - 일반 회원은 시간표 API(GET /reservations/schedule)로 본다.
// 등록·수정 응답: { unavailable, conflicts } - conflicts는 겹치는 기존 예약 (경고용, 예약은 그대로 둔다)
@ApiTags('Reservations · Unavailable (시설 사용 불가 기간)')
@Controller('reservations/facilities/:facilityId/unavailable')
export class FacilityUnavailableController {

    constructor(
        private readonly unavailableService: FacilityUnavailableService,
    ){}

    @Get()
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 사용 불가 기간 목록', description: 'from·to를 주면 그 기간 [from, to)와 겹치는 것만. 시작 시각순, 페이지.' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    findAll(
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Query() query: UnavailableListQueryDto,
    ) {
        return this.unavailableService.findAll( facilityId, query );
    }

    @Post()
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 사용 불가 기간 등록', description: '점검 등. 여러 날에 걸쳐도 된다. 이 기간에는 새 예약을 받지 않는다. 겹치는 기존 예약이 있어도 저장하고, 응답에 겹치는 예약 목록(경고)을 담는다. 기존 예약은 그대로 두고 예약자에게 알리지 않는다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 종료가 시작보다 뒤가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    create(
        @User() user: Pick<Users, 'id'>,
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Body() body: CreateUnavailableDto,
    ) {
        return this.unavailableService.create( user, facilityId, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 사용 불가 기간 수정', description: '보낸 항목만 바꾼다. 등록과 같이 겹치는 예약을 경고로 담는다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 종료가 시작보다 뒤가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설·사용 불가 기간' })
    update(
        @User() user: Pick<Users, 'id'>,
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateUnavailableDto,
    ) {
        return this.unavailableService.update( user, facilityId, id, body );
    }

    @Delete(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 사용 불가 기간 삭제' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설·사용 불가 기간' })
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.unavailableService.delete( user, facilityId, id );
    }
}
