import { Controller, Get, Body, Patch, Param, Delete, Query, ParseIntPipe, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, type Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { UserSearchService } from './user-search.service';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { PaginateUserQueryDto } from './dto/paginate-user-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { clearRefreshTokenCookie } from 'src/auth/const/refresh-cookie-const';
import type { Response } from 'express';
import { BulkDeleteUsersDto } from './dto/bulk-delete-users.dto';
import { BulkUpdateUsersRoleDto } from './dto/bulk-update-users-role.dto';
import { BulkUpdateUsersStatusDto } from './dto/bulk-update-users-status.dto';

@Controller('users')
export class UsersController {

  constructor(
    private readonly usersService: UsersService,
    private readonly userSearchService: UserSearchService,
  ) {}

  //* (개인) 회원 개인정보 조회
  @Get('me')
  getMe(
    @User() user: Pick<Users, 'id'>
  ) {
    return this.usersService.getMyInfo(user.id);
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


  //* (공용) 회원 검색 - 회원을 고르는 화면용, 재직 중인 승인 회원만 (UserSearchService) - ':id'보다 먼저 선언
  @Get('search')
  @Roles(UserRole.USER)
  searchUsers(
    @Query() query: UserSearchQueryDto,
  ) {
    return this.userSearchService.search( query.search );
  }

  //! ========== 관리자 서비스 로직 ==========
  // 'me', 'bulk'는 ':id' 라우트 아래에 둔다. (':id'가 먼저 선언되면 'me' 요청이 ':id'로 매칭됨)

  //* (관리자) 회원 전체 조회
  @Get()
  @RequireAdmin(AdminPermission.USERS)
  getAllUsers(
      @Query() query: PaginateUserQueryDto,
  ) {
    return this.usersService.paginateUser( query );
  }

  //* (관리자) 회원 상세 조회
  @Get(':id')
  @RequireAdmin(AdminPermission.USERS)
  getUserDetail(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.getUserDetail(id);
  }

  //* (관리자) 회원 정보 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.USERS)
  patchUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateUserDto,
  ) {
    return this.usersService.adminUpdateUser(id, body);
  }
  
  //* (관리자) 권한 변경 -> 다수
  @Patch('/bulk/role')
  @RequireAdmin(AdminPermission.USERS)
  patchBulkUsersRole(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkUpdateUsersRoleDto,
  ) {
    return this.usersService.updateUserRole(user, body.ids, body);
  }

  //* (관리자) 권한 변경 -> 단일
  @Patch(':id/role')
  @RequireAdmin(AdminPermission.USERS)
  patchUserRole(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.usersService.updateUserRole(user, [id], body);
  }
  
  //* (관리자) 회원 상태 변경 -> 다수
  @Patch('/bulk/status')
  @RequireAdmin(AdminPermission.USERS)
  patchBulkUsersStatus(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkUpdateUsersStatusDto,
  ) {
    return this.usersService.updateUserStatus(user, body.ids, body);
  }

  //* (관리자) 회원 상태 변경 -> 단일
  @Patch(':id/status')
  @RequireAdmin(AdminPermission.USERS)
  patchUserStatus(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.usersService.updateUserStatus(user, [id], body);
  }
  
  //* (관리자) 회원 삭제(soft delete) -> 다수
  @Delete('/bulk')
  @RequireAdmin(AdminPermission.USERS)
  bulkDeleteUsers(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkDeleteUsersDto,
  ) {
    return this.usersService.adminDeleteUser(user, body.ids);
  }
  
  //* (관리자) 회원 삭제(soft delete) -> 단일
  @Delete(':id')
  @RequireAdmin(AdminPermission.USERS)
  deleteUser(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.adminDeleteUser(user, [id]);
  }

  //* (관리자) 삭제 회원 복구
  @Patch(':id/delete_recovery')
  @RequireAdmin(AdminPermission.USERS)
  patchRestoreUser(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.recoveryUser(user, id);
  }

}
