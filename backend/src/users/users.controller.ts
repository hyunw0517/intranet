import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { PaginateUserQueryDto } from './dto/paginate-user-query.dto';

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
  getMe( @User() user: Users ) {
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
  deleteMe(
    @User() user: Pick<Users, 'id'>,
    @Body() body: DeleteUserDto,
  ) {
    return this.usersService.deleteUser(user, body);
  }

}
