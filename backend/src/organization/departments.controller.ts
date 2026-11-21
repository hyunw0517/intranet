import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentListQueryDto } from './dto/department-list-query.dto';
import { UpdateDepartmentOrderDto } from './dto/update-department-order.dto';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// 소속 - 부서 전용 컨트롤러
@ApiTags('Departments (부서)')
@Controller('departments')
export class DepartmentsController {

  constructor(private readonly departmentsService: DepartmentsService) {}

  //* 부서 전체 조회
  @Get()
  @RequireAdmin() // 여러 관리자 화면이 같이 쓰는 조회
  @ApiOperation({ summary: '부서 목록 (트리 순서)', description: '페이지 없이 전체를 트리 순서(상위 부서 → 그 하위 부서들 → 다음 상위 부서)의 평평한 목록으로 준다. 부서명 검색은 경로(상위 부서명 포함) 기준이라 상위 부서명으로 찾으면 하위 부서도 함께 나온다. 회원·게시판 권한·결재라인 등 여러 관리자 화면이 같이 쓴다.' })
  getListDepartments(
    @Query() query: DepartmentListQueryDto,
  ) {
    return this.departmentsService.getDepartments(query);
  }

  //* 부서 생성
  @Post()
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '부서 생성', description: '같은 상위 부서 아래 맨 뒤 순서로 추가한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 같은 상위 부서에 같은 부서명, 존재하지 않는 상위 부서' })
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
  @ApiOperation({ summary: '부서 순서 변경 (드래그 정렬)', description: '같은 상위 부서 아래의 형제 부서끼리만 바꾼다(상위 부서 이동은 부서 수정). 보낸 id 배열이 그 상위 부서의 하위 부서 전체와 정확히 일치해야 한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 보낸 id 목록이 현재 형제 부서와 다름(새로고침 필요)' })
  patchDepartmentOrder(
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateDepartmentOrderDto,
  ){
    return this.departmentsService.updateDepartmentOrder(user, body);
  }

  //* 부서 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.ORGANIZATION)
  @ApiOperation({ summary: '부서 수정', description: '상위 부서를 바꾸면 새 상위 부서의 맨 뒤로 옮기고 이전 형제 부서들의 순서를 당긴다(트랜잭션).' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 부서·상위 부서, 같은 상위 부서에 같은 부서명, 자기 자신 또는 하위 부서를 상위 부서로 지정' })
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
  @ApiOperation({ summary: '부서 삭제', description: '하위 부서·소속 인원·게시판 권한 사용이 없을 때만 지울 수 있다. 같은 상위 부서의 뒤 순서를 당긴다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 부서, 하위 부서가 있음, 소속 인원이 있음, 게시판 권한에서 사용 중' })
  deleteDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.departmentsService.deleteDepartment(user, id);
  }
  
}
