import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { User } from 'src/auth/decorator/user.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { CreateUserDepartmentDto } from './dto/create-user-department.dto';
import { UpdateUserDepartmentDto } from './dto/update-user-department.dto';
import { UpdateUserPositionDto } from './dto/update-user-position.dto';
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// 회원 소속 컨트롤러 -> 회원의 직급 + 소속(부서·직책) 연결
// 소속 추가/수정/삭제는 관리자, 대표 소속 변경은 관리자 + 회원 본인
@ApiTags('Organization (회원 소속)')
@Controller('organization')
export class OrganizationController {

  constructor(private readonly organizationService: OrganizationService) {}

  //* (개인) 내 소속 조회
  @Get('me')
  @ApiOperation({ summary: '내 소속 조회', description: '직급 + 소속 목록(부서·직책, 대표 소속 표시).' })
  getMyOrganization(
    @User() user: Pick<Users, 'id'>,
  ){
    return this.organizationService.getUserOrganization(user.id);
  }

  //* (개인) 내 대표 소속 변경 (마이페이지) 
  @Patch('me/departments/:id/primary')
  @ApiOperation({ summary: '내 대표 소속 변경', description: '마이페이지. 내 소속만 바꿀 수 있다(다른 회원의 소속 id면 400).' })
  @ApiBadRequestResponse({ description: '존재하지 않는 소속(내 소속이 아님 포함)' })
  patchMyPrimaryDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    // userId 자리에 로그인 회원 id를 넘겨 본인 소속만 변경 가능
    return this.organizationService.updatePrimaryUserDepartment(user, user.id, id);
  }

  //* (관리자) 회원 소속 조회
  @Get('users/:userId')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 소속 조회', description: '직급 + 소속 목록.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 회원' })
  getUserOrganization(
    @Param('userId', ParseIntPipe) userId: number,
  ){
    return this.organizationService.getUserOrganization(userId);
  }

  //* (관리자) 회원 직급 지정
  @Patch('users/:userId/position')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 직급 지정', description: '`positionId: null`이면 직급을 해제한다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 회원·직급' })
  patchUserPosition(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateUserPositionDto,
  ){
    return this.organizationService.updateUserPosition(userId, body);
  }

  //* (관리자) 회원 소속 추가
  @Post('users/:userId/departments')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 소속 추가 (겸직)', description: '첫 소속이면 대표 소속으로 자동 지정한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 회원·부서·직책, 이미 소속된 부서' })
  postUserDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: CreateUserDepartmentDto,
  ){
    return this.organizationService.createUserDepartment(user, userId, body);
  }

  //* (관리자) 회원 소속 수정
  @Patch('users/:userId/departments/:id')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 소속 수정 (부서·직책)' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 소속·부서·직책, 이미 소속된 부서' })
  patchUserDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDepartmentDto,
  ){
    return this.organizationService.updateUserDepartment(user, userId, id, body);
  }

  //* (관리자) 회원 대표 소속 변경
  @Patch('users/:userId/departments/:id/primary')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 대표 소속 변경', description: '기존 대표를 해제하고 새 대표를 지정한다(트랜잭션).' })
  @ApiBadRequestResponse({ description: '존재하지 않는 소속' })
  patchUserPrimaryDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.organizationService.updatePrimaryUserDepartment(user, userId, id);
  }

  //* (관리자) 회원 소속 삭제
  @Delete('users/:userId/departments/:id')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 소속 삭제', description: '대표 소속을 지우면 남은 소속 중 가장 오래된 소속이 대표가 된다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 소속' })
  deleteUserDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.organizationService.deleteUserDepartment(user, userId, id);
  }

}
