import { Body, Controller, Param, ParseIntPipe, Patch, Post, Request, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from './decorator/user.decorator';
import { Roles } from './decorator/roles.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { RefreshTokenGuard } from './guard/bearer-token.guard';
import { BasicTokenGuard } from './guard/basic-token.guard';
import type { Response } from 'express';
import { clearRefreshTokenCookie, refreshTokenCookieOptions } from './const/refresh-cookie-const';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //* (개인) 쿠키의 Refresh 토큰 -> Access 토큰 재발급
  @Post('token/access')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenAccess( @Request() req: any ){
    // RefreshTokenGuard가 쿠키에서 꺼내 검증한 토큰
    const newToken = this.authService.rotateToken(req.token, false);

    return {
      accessToken: newToken,
    };
  }

  //* (개인) 쿠키의 Refresh 토큰 -> Refresh 토큰 재발급 (쿠키로 다시 저장)
  @Post('token/refresh')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  postTokenRefresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const newToken = this.authService.rotateToken(req.token, true);

    res.cookie( "refreshToken", newToken, refreshTokenCookieOptions() );

    return true;
  }

  //* (개인) 회원 로그인 요청
  @Post('login/emp')
  @IsPublic()
  @UseGuards(BasicTokenGuard)
  postLoginEmpNo(
    @Request() req: any, 
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken } = this.authService.loginUser( req.user );

    res.cookie( "refreshToken", refreshToken, refreshTokenCookieOptions() );

    return { accessToken };
  }

  //* (개인) 로그아웃 - refreshToken 쿠키 삭제
  //      - access token이 만료된 상태에서도 로그아웃할 수 있도록 공개 라우트로 둔다.
  @Post('logout')
  @IsPublic()
  postLogout(
    @Res({ passthrough: true }) res: Response,
  ){
    clearRefreshTokenCookie(res);

    return true;
  }

  //* (개인) 회원가입
  @Post('register/emp')
  @IsPublic()
  async postRegisterEmpNo(
    @Body() body: RegisterUserDto,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken } = await this.authService.registerWithEmpNo(
      body,
    );

    res.cookie( "refreshToken", refreshToken, refreshTokenCookieOptions() );

    return { accessToken };
  }

  //* (개인) 비밀번호 변경 - 변경한 본인에게는 새 토큰 발급
  @Patch('change/pw')
  async patchPassword(
    @User() user: Pick<Users, 'id'>,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken } = await this.authService.changePassword(user, body);

    res.cookie( "refreshToken", refreshToken, refreshTokenCookieOptions() );

    return { accessToken };
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
