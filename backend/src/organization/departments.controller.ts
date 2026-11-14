import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentListQueryDto } from './dto/department-list-query.dto';
import { UpdateDepartmentOrderDto } from './dto/update-department-order.dto';

// 소속 - 부서 전용 컨트롤러
@Controller('departments')
export class DepartmentsController {

  constructor(private readonly departmentsService: DepartmentsService) {}

  //* 부서 전체 조회
  @Get()
  @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
  getListDepartments(
    @Query() query: DepartmentListQueryDto,
  ) {
    return this.departmentsService.getDepartments(query);
  }

  //* 부서 생성
  @Post()
  @RequireAdmin(AdminPermission.ORGANIZATION)
  postDepartments(
    @User() user: Pick<Users, 'id'>,
    @Body() body: CreateDepartmentDto,
  ){
    return this.departmentsService.createDepartment(user, body);
  }

  //* 부서 순서 변경 (드래그 정렬, 같은 상위 부서의 형제 부서끼리)
  // 'order'는 ':id'보다 먼저 선언해야 한다. (뒤에 두면 'order'가 :id로 매칭되어 ParseIntPipe 400)
  @Patch('order')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  patchDepartmentOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateDepartmentOrderDto,
  ){
    return this.departmentsService.updateDepartmentOrder(user, body);
  }

  //* 부서 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  patchDepartments(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateDepartmentDto,
  ){
    return this.departmentsService.updateDepartment(user, id, body);
  }

  //* 부서 삭제
  @Delete(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  deleteDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.departmentsService.deleteDepartment(user, id);
  }
  
}
