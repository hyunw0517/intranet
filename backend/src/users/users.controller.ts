import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';

@Controller('users')
export class UsersController {

  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  getAllUsers() {
    return this.usersService.readAllUsers();
  }

  //* 회원 개인정보 조회
  @Get('me')
  getMe( @User() user: Users ) {
    return user;
  }

  //* 회원 개인정보 수정(UPDATE)
  @Patch('me')
  patchMe(
    //@User('id') userId: number,
    @User() user: Pick<Users, 'id'>,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.updateUser(user, body);
  }

  //* 회원 삭제(soft delete)
  @Delete('me')
  deleteMe(
    @User() user: Pick<Users, 'id'>,
    @Body() body: DeleteUserDto,
  ) {
    return this.usersService.deleteUser(user, body);
  }

}
