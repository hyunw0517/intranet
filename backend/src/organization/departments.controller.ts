import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { PaginateDepartmentQueryDto } from './dto/paginate-department-query.dto';

// 소속 - 부서 전용 컨트롤러
@Controller('departments')
export class DepartmentsController {

  constructor(private readonly departmentsService: DepartmentsService) {}

  //* 부서 전체 조회
  @Get()
  @Roles(UserRole.ADMIN)
  getListDepartments(
    @Query() query: PaginateDepartmentQueryDto,
  ) {
    return this.departmentsService.paginateDepartment(query);
  }

  //* 부서 생성
  @Post()
  @Roles(UserRole.ADMIN)
  postDepartments(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateDepartmentDto,
  ){
    return this.departmentsService.createDepartment(user, body);
  }

  //* 부서 수정
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  patchDepartments(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDepartmentDto,
  ){
    return this.departmentsService.updateDepartment(user, id, body);
  }

  //* 부서 삭제
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deleteDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.departmentsService.deleteDepartment(user, id);
  }
  
}
