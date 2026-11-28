import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { UpdateSortOrderDto } from 'src/organization/dto/update-sort-order.dto';
import { CreateFacilityCategoryDto } from './dto/create-facility-category.dto';
import { UpdateFacilityCategoryDto } from './dto/update-facility-category.dto';
import { FacilityCategoriesService } from './facility-categories.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 시설 분류 - 목록은 모든 회원, 관리는 관리자
@ApiTags('Reservations · Categories (시설 분류)')
@Controller('reservations/categories')
export class FacilityCategoriesController {

    constructor(
        private readonly categoriesService: FacilityCategoriesService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '시설 분류 목록', description: '분류마다 예약 규칙(예약 단위·운영 시간·운영 요일·최대 예약 가능 일수)을 가진다. 순서(sortOrder)대로.' })
    findAll() {
        return this.categoriesService.findAll();
    }

    @Post()
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 분류 생성', description: '분류가 그 시설들의 예약 규칙을 정한다. 운영 시간은 HH:mm(24시간 운영은 00:00~24:00)이고 예약 단위로 나누어떨어져야 한다. 맨 뒤 순서로 추가한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 존재하는 분류명, 운영 시간 형식·범위 오류, 운영 시간이 예약 단위로 나누어떨어지지 않음' })
    create(
        @User() user: Pick<Users, 'id'>,
        @Body() body: CreateFacilityCategoryDto,
    ) {
        return this.categoriesService.create( user, body );
    }

    //* 순서 변경 ('order'는 ':id'보다 먼저 선언)
    @Patch('order')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 분류 순서 변경 (드래그 정렬)', description: '화면의 최종 순서대로 id 전체를 보낸다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 보낸 id 목록이 현재 분류 목록과 다름(새로고침 필요)' })
    updateOrder(
        @User() user: Pick<Users, 'id'>,
        @Body() body: UpdateSortOrderDto,
    ) {
        return this.categoriesService.updateOrder( user, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 분류 수정', description: '보낸 항목만 바꾼다. 규칙을 바꿔도 이미 있는 예약은 그대로 두고 새 예약부터 적용한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 이미 존재하는 분류명, 운영 시간 오류' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설 분류' })
    update(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateFacilityCategoryDto,
    ) {
        return this.categoriesService.update( user, id, body );
    }

    @Delete(':id')
    @RequireAdmin(AdminPermission.FACILITIES)
    @ApiOperation({ summary: '(관리자) 시설 분류 삭제', description: '시설이 남아 있는 분류는 지울 수 없다.' })
    @ApiNotFoundResponse({ description: '존재하지 않는 시설 분류' })
    @ApiConflictResponse({ description: '시설이 남아 있음' })
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.categoriesService.delete( user, id );
    }
}
