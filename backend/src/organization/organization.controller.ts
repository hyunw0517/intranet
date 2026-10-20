import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { User } from 'src/auth/decorator/user.decorator';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { CreateUserDepartmentDto } from './dto/create-user-department.dto';
import { UpdateUserDepartmentDto } from './dto/update-user-department.dto';
import { UpdateUserPositionDto } from './dto/update-user-position.dto';

// 회원 소속 컨트롤러 -> 회원의 직급 + 소속(부서·직책) 연결
// 소속 추가/수정/삭제는 관리자, 대표 소속 변경은 관리자 + 회원 본인
@Controller('organization')
export class OrganizationController {

  constructor(private readonly organizationService: OrganizationService) {}

  //* (개인) 내 소속 조회
  @Get('me')
  getMyOrganization(
    @User() user: Pick<Users, 'id'>,
  ){
    return this.organizationService.getUserOrganization(user.id);
  }

  //* (개인) 내 대표 소속 변경 (마이페이지) 
  @Patch('me/departments/:id/primary')
  patchMyPrimaryDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ){
    // userId 자리에 로그인 회원 id를 넘겨 본인 소속만 변경 가능
    return this.organizationService.updatePrimaryUserDepartment(user, user.id, id);
  }

  //* (관리자) 회원 소속 조회
  @Get('users/:userId')
  @Roles(UserRole.ADMIN)
  getUserOrganization(
    @Param('userId', ParseIntPipe) userId: number,
  ){
    return this.organizationService.getUserOrganization(userId);
  }

  //* (관리자) 회원 직급 지정
  @Patch('users/:userId/position')
  @Roles(UserRole.ADMIN)
  patchUserPosition(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: UpdateUserPositionDto,
  ){
    return this.organizationService.updateUserPosition(userId, body);
  }

  //* (관리자) 회원 소속 추가
  @Post('users/:userId/departments')
  @Roles(UserRole.ADMIN)
  postUserDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: CreateUserDepartmentDto,
  ){
    return this.organizationService.createUserDepartment(user, userId, body);
  }

  //* (관리자) 회원 소속 수정
  @Patch('users/:userId/departments/:id')
  @Roles(UserRole.ADMIN)
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
  @Roles(UserRole.ADMIN)
  patchUserPrimaryDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.organizationService.updatePrimaryUserDepartment(user, userId, id);
  }

  //* (관리자) 회원 소속 삭제
  @Delete('users/:userId/departments/:id')
  @Roles(UserRole.ADMIN)
  deleteUserDepartment(
    @User() user: Pick<Users, 'id'>,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
  ){
    return this.organizationService.deleteUserDepartment(user, userId, id);
  }

}
