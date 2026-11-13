import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { UpdateSortOrderDto } from 'src/organization/dto/update-sort-order.dto';
import { CreateFacilityCategoryDto } from './dto/create-facility-category.dto';
import { UpdateFacilityCategoryDto } from './dto/update-facility-category.dto';
import { FacilityCategoriesService } from './facility-categories.service';

//* 시설 분류 - 목록은 모든 회원(예약 화면 탭·입력 제한), 관리는 관리자
@Controller('reservations/categories')
export class FacilityCategoriesController {

    constructor(
        private readonly categoriesService: FacilityCategoriesService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    findAll() {
        return this.categoriesService.findAll();
    }

    @Post()
    @Roles(UserRole.ADMIN)
    create(
        @User() user: Pick<Users, 'id'>,
        @Body() body: CreateFacilityCategoryDto,
    ) {
        return this.categoriesService.create( user, body );
    }

    //* 순서 변경 ('order'는 ':id'보다 먼저 선언)
    @Patch('order')
    @Roles(UserRole.ADMIN)
    updateOrder(
        @User() user: Pick<Users, 'id'>,
        @Body() body: UpdateSortOrderDto,
    ) {
        return this.categoriesService.updateOrder( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.ADMIN)
    update(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateFacilityCategoryDto,
    ) {
        return this.categoriesService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    delete(
        @User() user: Pick<Users, 'id'>,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.categoriesService.delete( user, id );
    }
}
