import { Body, Controller, Headers, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from './decorator/user.decorator';
import { Roles } from './decorator/roles.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { RefreshTokenGuard } from './guard/bearer-token.guard';
import { BasicTokenGuard } from './guard/basic-token.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //* (개인) Bearer -> Access 토큰 재발급 
  @Post('token/access')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenAccess( @Headers('authorization') rawToken: string ){
    const token = this.authService.extractTokenFromHeader(rawToken, true);

    // { accessToken: {token} }
    const newToken = this.authService.rotateToken(token, false);

    return {
      accessToken: newToken, 
    };
  }
  
  //* (개인) Bearer -> Refresh 토큰 재발급 
  @Post('token/refresh')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenRefresh( @Headers('authorization') rawToken: string ){
    const token = this.authService.extractTokenFromHeader(rawToken, true);

    // { refreshToken: {token} }
    const newToken = this.authService.rotateToken(token, true);

    return {
      refreshToken: newToken, 
    };
  }

  //* (개인) 회원 로그인 요청
  @Post('login/emp')
  @IsPublic()
  @UseGuards(BasicTokenGuard)
  postLoginEmpNo(
    // @Body('empNo') empNo: string, 
    // @Body('password') password: string, 
    //@Headers( 'authorization' ) rawToken: string, 
    @Request() req: any, 
  ){
    return this.authService.loginUser( req.user );
  }

  //* (개인) 회원가입
  @Post('register/emp')
  @IsPublic()
  postRegisterEmpNo(
    @Body() body: RegisterUserDto
  ){
    return this.authService.registerWithEmpNo(
      body,
    );
  }

  //* (개인) 비밀번호 변경
  @Patch('change/pw')
  patchPassword(
    @User() user: Pick<Users, 'id'>,
    @Body() body: ChangePasswordDto,
  ){
    return this.authService.changePassword(user, body);
  }

  //* (관리자) 회원 비밀번호 초기화
  @Patch('reset/pw/:userId')
  @Roles(UserRole.ADMIN)
  patchResetPassword(
    @Param('userId', ParseIntPipe) userId: number,
  ){
    return this.authService.resetPassword(userId);
  }

}
