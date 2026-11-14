import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { CreateUnavailableDto } from './dto/create-unavailable.dto';
import { UnavailableListQueryDto } from './dto/unavailable-list-query.dto';
import { UpdateUnavailableDto } from './dto/update-unavailable.dto';
import { FacilityUnavailableService } from './facility-unavailable.service';

//* 시설 사용 불가 기간 (관리자) - 일반 회원은 시간표 API(GET /reservations/schedule)로 본다.
// 등록·수정 응답: { unavailable, conflicts } - conflicts는 겹치는 기존 예약 (경고용, 예약은 그대로 둔다)
@Controller('reservations/facilities/:facilityId/unavailable')
export class FacilityUnavailableController {

    constructor(
        private readonly unavailableService: FacilityUnavailableService,
    ){}

    @Get()
    @RequireAdmin(AdminPermission.FACILITIES)
    findAll(
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Query() query: UnavailableListQueryDto,
    ) {
        return this.unavailableService.findAll( facilityId, query );
    }

    @Post()
    @RequireAdmin(AdminPermission.FACILITIES)
    create(
        @User() user: Pick<Users, 'id'>,
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Body() body: CreateUnavailableDto,
    ) {
        return this.unavailableService.create( user, facilityId, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
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
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('facilityId', ParseIntPipe) facilityId: number,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.unavailableService.delete( user, facilityId, id );
    }
}
