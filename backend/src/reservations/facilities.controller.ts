import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { FacilityListQueryDto } from './dto/facility-list-query.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilitiesService } from './facilities.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 시설 - 목록·상세는 모든 회원, 관리는 관리자
@ApiTags('Reservations · Facilities (시설)')
@Controller('reservations/facilities')
export class FacilitiesController {

    constructor(
        private readonly facilitiesService: FacilitiesService,
    ){}

    //* 예약 가능한 시설 (사용 중인 것만, ?categoryId=)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예약 가능한 시설 목록', description: '사용 중인 시설만. categoryId로 거를 수 있다.' })
    findActive( @Query() query: FacilityListQueryDto ) {
        return this.facilitiesService.findActive( query );
    }

    //* 관리자 목록 (사용 안 함 포함) - 'admin'은 ':id'보다 먼저 선언
    @Get('admin')
    @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
    @ApiOperation({ summary: '(관리자) 시설 목록', description: '사용 안 함 시설 포함. 여러 관리자 화면이 같이 쓴다.' })
    findAllForAdmin( @Query() query: FacilityListQueryDto ) {
        return this.facilitiesService.findAllForAdmin( query );
    }

    @Get(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '시설 상세' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    findOne( @Param('id', ParseIntPipe) id: number ) {
        return this.facilitiesService.findOne( id );
    }

    @Post()
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 생성', description: '모든 시설은 분류에 속한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 시설 분류, 같은 분류에 같은 이름의 시설' })
    create(
        @User() user: Pick<Users, 'id'>,
        @Body() body: CreateFacilityDto,
    ) {
        return this.facilitiesService.create( user, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 수정', description: '보낸 항목만 바꾼다. 분류를 옮기면 새 예약부터 옮긴 분류의 규칙을 따른다. 사용 안 함(isActive: false)으로 바꾸면 새 예약을 받지 않고 기존 예약은 유지한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 시설 분류, 같은 분류에 같은 이름의 시설' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
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
    @ApiOperation({ summary: '(관리자) 시설 삭제', description: '앞으로의 예약이 있으면 지울 수 없다(사용 안 함으로 바꾸거나 예약을 정리한 뒤 삭제).' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설' })
    @ApiConflictResponse({ description: '앞으로의 예약이 있음' })
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.facilitiesService.delete( user, id );
    }
}
