import { Controller, Get, Body, Patch, Param, Delete, Query, ParseIntPipe, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { PaginateUserQueryDto } from './dto/paginate-user-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { clearRefreshTokenCookie } from 'src/auth/const/refresh-cookie-const';
import type { Response } from 'express';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {}

  //* (관리자) 회원 전체 조회
  @Get()
  @Roles(UserRole.ADMIN)
  getAllUsers(
      @Query() query: PaginateUserQueryDto,
  ) {
    return this.usersService.paginateUser( query );
  }

  //* (개인) 회원 개인정보 조회
  @Get('me')
  getMe( 
    @User() user: Users 
  ) {
    return user;
  }

  //* (개인) 회원 개인정보 수정(UPDATE)
  @Patch('me')
  patchMe(
    //@User('id') userId: number,
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.updateUser(user, body);
  }

  //* (개인) 회원 삭제(soft delete)
  @Delete('me')
  async deleteMe(
    @User() user: Pick<Users, 'id'>,
    @Body() body: DeleteUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.usersService.deleteUser(user, body);

    clearRefreshTokenCookie(res);

    return true;
  }

  // 관리자 라우트는 'me' 라우트 아래에 둔다. (':id'가 먼저 선언되면 'me' 요청이 ':id'로 매칭됨)

  //* (관리자) 회원 상세 조회
  @Get(':id')
  @Roles(UserRole.ADMIN)
  getUserDetail(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.getUserDetail(id);
  }

  //* (관리자) 가입 승인 및 권한 변경 + 입사일 설정
  @Patch(':id/agree')
  @Roles(UserRole.ADMIN)
  patchUserRole(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.usersService.updateUserRole(user, id, body);
  }

  //* (관리자) 회원 정보 수정
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  patchUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdateUser(id, body);
  }

  //* (관리자) 회원 상태 변경
  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  patchUserStatus(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(user, id, body);
  }
  
  //* (관리자) 회원 삭제(soft delete)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteUser(
    @User() user: Pick<Users, 'id'>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.usersService.adminDeleteUser(user, id);
  
    return true;
  }

  //* (관리자) 삭제 회원 복구
  @Patch(':id/delete_recovery')
  @Roles(UserRole.ADMIN)
  patchRestoreUser(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.recoveryUser(id);
  }

}
