import { Controller, Get, Body, Patch, Param, Delete, Query, ParseIntPipe, Res, Put } from '@nestjs/common';
import { SetProfileImageDto } from './dto/set-profile-image.dto';
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
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MyInfoResponse, UserDetailResponse, UserListResponse, UserSearchItemResponse, UserStatsResponse } from './dto/user-response.dto';

@ApiTags('Users (회원)')
@Controller('users')
export class UsersController {

  constructor(
    private readonly usersService: UsersService,
    private readonly userSearchService: UserSearchService,
  ) {}

  //* (개인) 회원 개인정보 조회
  @Get('me')
  @ApiOperation({ summary: '내 정보 조회', description: '로그인 직후·새로고침 시 현재 사용자를 확인한다. access token은 DB를 보지 않으므로 회원 정보는 여기서 조회한다.' })
  getMe(
    @User() user: Pick<Users, 'id'>
  ): Promise<MyInfoResponse> {
    return this.usersService.getMyInfo(user.id);
  }

  //* (개인) 회원 개인정보 수정(UPDATE)
  @Patch('me')
  @ApiOperation({ summary: '내 정보 수정', description: '현재 비밀번호로 본인 확인 후 수정한다. 비밀번호 변경은 PATCH /auth/change/pw. 응답은 GET /users/me와 같은 형태다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 현재 비밀번호 불일치, 이미 가입된 이메일' })
  patchMe(
    //@User('id') userId: number,
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateUserDto,
  ): Promise<MyInfoResponse> {
    return this.usersService.updateUser(user, body);
  }

  //* (개인) 회원 삭제(soft delete)
  @Delete('me')
  @ApiOperation({ summary: '회원 탈퇴 (soft delete)', description: '현재 비밀번호로 본인 확인 후 탈퇴하고 refresh 쿠키를 지운다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '비밀번호 불일치' })
  async deleteMe(
    @User() user: Pick<Users, 'id'>,
    @Body() body: DeleteUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<boolean> {
    await this.usersService.deleteUser(user, body);

    clearRefreshTokenCookie(res);

    return true;
  }

  //* (개인) 프로필 사진 등록·변경 → 내 정보 (GET /users/me와 같은 형태)
  //  - 업로드(POST /common/files/images)가 USER 이상이라 연결도 USER 이상 (승인 대기 회원은 사진을 등록할 수 없다)
  @Put('me/profile-image')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '프로필 사진 등록·변경', description: '이미지를 POST /common/files/images로 먼저 올리고 그 id를 보낸다. 회원당 1장이라 기존 사진은 서버가 지운다. 업로드가 USER 이상이라 연결도 USER 이상이다. 응답은 GET /users/me와 같은 형태다.' })
  @ApiBadRequestResponse({ description: '내가 올린 미연결 이미지가 아님' })
  putMyProfileImage(
    @User() user: Pick<Users, 'id'>,
    @Body() body: SetProfileImageDto,
  ): Promise<MyInfoResponse> {
    return this.usersService.setMyProfileImage(user.id, body.fileId);
  }

  //* (개인) 프로필 사진 삭제 → 내 정보
  @Delete('me/profile-image')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '프로필 사진 삭제', description: '사진이 없어도 성공한다. 응답은 GET /users/me와 같은 형태다.' })
  deleteMyProfileImage(
    @User() user: Pick<Users, 'id'>,
  ): Promise<MyInfoResponse> {
    return this.usersService.deleteMyProfileImage(user.id);
  }


  //* (공용) 회원 검색 - 회원을 고르는 화면용, 재직 중인 승인 회원만 (UserSearchService) - ':id'보다 먼저 선언
  @Get('search')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: '회원 검색 (회원 선택 화면용)', description: '재직 중인 승인 회원(GUEST 제외)만 이름·사번·부서명으로 찾는다. 이름순 최대 20명. 다른 회원에게 보여도 되는 정보만 응답한다(이메일·연락처·생일 없음). 과제 관리 참여자 추가, 결재자 선택에서 쓴다.' })
  searchUsers(
    @Query() query: UserSearchQueryDto,
  ): Promise<UserSearchItemResponse[]> {
    return this.userSearchService.search( query.search );
  }

  //! ========== 관리자 서비스 로직 ==========
  // 'me', 'bulk'는 ':id' 라우트 아래에 둔다. (':id'가 먼저 선언되면 'me' 요청이 ':id'로 매칭됨)

  //* (관리자) 회원 현황 건수 (대시보드) - ':id'보다 먼저 선언
  @Get('stats')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 현황 건수', description: '대시보드용. 가입 승인 대기, 재직, 비활성, 로그인 잠금 인원.' })
  getUserStats(): Promise<UserStatsResponse> {
    return this.usersService.getUserStats();
  }

  //* (관리자) 회원 전체 조회
  @Get()
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 목록', description: '검색·필터·정렬·페이지. 부서명 검색과 직책 필터는 겸직 소속 중 하나라도 맞으면 포함한다(둘 다 주면 같은 소속이 둘 다 맞아야 한다). `deletedOnly=true`면 삭제된 회원만(복구 대상 확인용). 소속은 기본 대표 소속만, `allDepartments=true`면 전체.' })
  @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
  getAllUsers(
      @Query() query: PaginateUserQueryDto,
  ): Promise<UserListResponse> {
    return this.usersService.paginateUser( query );
  }

  //* (관리자) 회원 상세 조회
  @Get(':id')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 상세', description: '개인정보(휴대폰·전화·생일)와 로그인 잠금 상태를 포함한다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 회원(삭제된 회원 포함), id가 숫자가 아님' })
  getUserDetail(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserDetailResponse> {
    return this.usersService.getUserDetail(id);
  }

  //* (관리자) 회원 정보 수정
  @Patch(':id')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 정보 수정', description: '본인 수정과 달리 현재 비밀번호 확인이 없고 사번·입사일도 수정할 수 있다. 비밀번호는 PATCH /auth/reset/pw/:userId로만 바꾼다. 응답은 회원 상세와 같은 형태다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 존재하지 않는 회원, 승인된 회원의 입사일 비우기, 이미 사용 중인 이메일·사번' })
  patchUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateUserDto,
  ): Promise<UserDetailResponse> {
    return this.usersService.adminUpdateUser(id, body);
  }
  
  //* (관리자) 권한 변경 -> 다수
  @Patch('/bulk/role')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 권한 변경·가입 승인 (여러 명)', description: 'GUEST → USER/ADMIN이면 가입 승인이다(입사일이 등록된 회원만). 한 명이라도 처리할 수 없으면 전체 실패(트랜잭션). ADMIN 이상 지정·관리자 기능 지정·관리자 계정 변경은 슈퍼관리자만. 관리자 권한이 줄어드는 회원은 다시 로그인해야 한다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: 'GUEST로 변경, ADMIN이 아닌데 관리자 기능 지정, 본인 포함, 존재하지 않는 회원 포함, 입사일 없는 승인 대기 회원 포함, 마지막 슈퍼관리자 강등, 동시 변경으로 대상이 바뀜' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 슈퍼관리자만 할 수 있는 변경' })
  patchBulkUsersRole(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkUpdateUsersRoleDto,
  ): Promise<boolean> {
    return this.usersService.updateUserRole(user, body.ids, body);
  }

  //* (관리자) 권한 변경 -> 단일
  @Patch(':id/role')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 권한 변경·가입 승인 (한 명)', description: 'PATCH /users/bulk/role과 같은 규칙(같은 서비스)을 한 명에게 적용한다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: 'PATCH /users/bulk/role과 같음' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 슈퍼관리자만 할 수 있는 변경' })
  patchUserRole(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserRoleDto,
  ): Promise<boolean> {
    return this.usersService.updateUserRole(user, [id], body);
  }
  
  //* (관리자) 회원 상태 변경 -> 다수
  @Patch('/bulk/status')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 상태 변경 (여러 명)', description: '재직·비활성·퇴사. 한 명이라도 처리할 수 없으면 전체 실패(트랜잭션). 관리자 계정은 슈퍼관리자만 바꿀 수 있다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '본인 포함, 존재하지 않는 회원 포함, 마지막 슈퍼관리자 정지, 동시 변경으로 대상이 바뀜' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 관리자 계정인데 슈퍼관리자가 아님' })
  patchBulkUsersStatus(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkUpdateUsersStatusDto,
  ): Promise<boolean> {
    return this.usersService.updateUserStatus(user, body.ids, body);
  }

  //* (관리자) 회원 상태 변경 -> 단일
  @Patch(':id/status')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 상태 변경 (한 명)', description: 'PATCH /users/bulk/status와 같은 규칙(같은 서비스)을 한 명에게 적용한다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: 'PATCH /users/bulk/status와 같음' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 관리자 계정인데 슈퍼관리자가 아님' })
  patchUserStatus(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
  ): Promise<boolean> {
    return this.usersService.updateUserStatus(user, [id], body);
  }
  
  //* (관리자) 회원 삭제(soft delete) -> 다수
  @Delete('/bulk')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 삭제 (여러 명, soft delete)', description: '한 명이라도 처리할 수 없으면 전체 실패(트랜잭션). 삭제된 회원의 토큰은 무효가 된다(tokenVersion 증가). 관리자 계정은 슈퍼관리자만 삭제할 수 있다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: '본인 포함, 존재하지 않는 회원 포함, 마지막 슈퍼관리자 삭제, 동시 변경으로 대상이 바뀜' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 관리자 계정인데 슈퍼관리자가 아님' })
  bulkDeleteUsers(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Body() body: BulkDeleteUsersDto,
  ): Promise<boolean> {
    return this.usersService.adminDeleteUser(user, body.ids);
  }
  
  //* (관리자) 회원 삭제(soft delete) -> 단일
  @Delete(':id')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 삭제 (한 명, soft delete)', description: 'DELETE /users/bulk와 같은 규칙(같은 서비스)을 한 명에게 적용한다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: 'DELETE /users/bulk와 같음' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 관리자 계정인데 슈퍼관리자가 아님' })
  deleteUser(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<boolean> {
    return this.usersService.adminDeleteUser(user, [id]);
  }

  //* (관리자) 삭제 회원 복구
  @Patch(':id/delete_recovery')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 삭제 회원 복구', description: '삭제된 동안 다른 회원이 같은 이메일·사번을 쓰게 됐으면 복구할 수 없다. 삭제 전 토큰이 다시 유효해지지 않도록 tokenVersion을 올린다. 응답은 회원 상세와 같은 형태다.' })
  @ApiBadRequestResponse({ description: '삭제된 회원이 아님, 같은 이메일·사번을 쓰는 회원이 있음' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 관리자 계정인데 슈퍼관리자가 아님' })
  patchRestoreUser(
    @User() user: Pick<Users, 'id' | 'role'>,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UserDetailResponse> {
    return this.usersService.recoveryUser(user, id);
  }

}
