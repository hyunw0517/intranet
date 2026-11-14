import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { FacilityListQueryDto } from './dto/facility-list-query.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilitiesService } from './facilities.service';

//* 시설 - 목록·상세는 모든 회원, 관리는 관리자
@Controller('reservations/facilities')
export class FacilitiesController {

    constructor(
        private readonly facilitiesService: FacilitiesService,
    ){}

    //* 예약 가능한 시설 (사용 중인 것만, ?categoryId=)
    @Get()
    @Roles(UserRole.USER)
    findActive( @Query() query: FacilityListQueryDto ) {
        return this.facilitiesService.findActive( query );
    }

    //* 관리자 목록 (사용 안 함 포함) - 'admin'은 ':id'보다 먼저 선언
    @Get('admin')
    @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
    findAllForAdmin( @Query() query: FacilityListQueryDto ) {
        return this.facilitiesService.findAllForAdmin( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.facilitiesService.findOne( id );
    }

    @Post()
    @RequireAdmin(AdminPermission.FACILITIES)
    create(
        @User() user: Pick<Users, 'id'>,
        @Body() body: CreateFacilityDto,
    ) {
        return this.facilitiesService.create( user, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    update(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateFacilityDto,
    ) {
        return this.facilitiesService.update( user, id, body );
    }

    //* 삭제 - 앞으로의 예약이 있으면 409
    @Delete(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.facilitiesService.delete( user, id );
    }
}
