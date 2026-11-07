import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Request, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from './decorator/user.decorator';
import { SessionId } from './decorator/session-id.decorator';
import { Roles } from './decorator/roles.decorator';
import { UserRole, type Users } from 'src/generated/prisma/client';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { RefreshTokenGuard } from './guard/bearer-token.guard';
import { BasicTokenGuard } from './guard/basic-token.guard';
import type { Response } from 'express';
import { clearRefreshTokenCookie, setRefreshTokenCookie } from './const/refresh-cookie-const';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //* (개인) 쿠키의 Refresh 토큰 -> Access 토큰 재발급 + Refresh 토큰 교체(rotation)
  //      - 프론트가 401을 받으면 호출하는 재발급 API. refresh token도 매번 새 것으로 바뀐다.
  @Post('token/access')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  async postTokenAccess(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ){
    // RefreshTokenGuard가 쿠키에서 꺼내 검증한 payload와 사용자
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.reissueTokens(req.tokenPayload, req.user);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 쿠키의 Refresh 토큰 -> Refresh 토큰 재발급 (쿠키로 다시 저장)
  //      - token/access와 같은 교체 로직을 쓴다. (refresh만 필요할 때를 위해 남겨 둔 API)
  @Post('token/refresh')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  async postTokenRefresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { refreshToken, refreshTokenMaxAge } = await this.authService.reissueTokens(req.tokenPayload, req.user);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return true;
  }

  //* (개인) 회원 로그인 요청 - 세션(기기) 1개 생성
  @Post('login/emp')
  @IsPublic()
  @UseGuards(BasicTokenGuard)
  async postLoginEmpNo(
    @Request() req: any,
    @Headers('user-agent') userAgent: string | undefined, // 기기 목록 표시용
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.loginUser( req.user, userAgent );

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 로그아웃 - refreshToken 쿠키 삭제 + 이 기기의 세션 폐기
  //      - access token이 만료된 상태에서도 로그아웃할 수 있도록 공개 라우트로 둔다.
  //      - 세션은 refresh 쿠키의 sid로 찾는다. (Path=/api/auth라 이 요청에 자동으로 실려 온다)
  //      - 다른 기기의 로그인은 그대로 유지된다.
  @Post('logout')
  @IsPublic()
  async postLogout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ){
    // DB 처리가 실패해도 이 기기의 쿠키는 지워지도록 먼저 삭제한다.
    clearRefreshTokenCookie(res);

    await this.authService.logout(req.cookies?.refreshToken);

    return true;
  }

  //* (개인) 모든 기기에서 로그아웃 - 지금 기기만 유지
  //      - tokenVersion이 올라가 다른 기기의 access·refresh 토큰이 즉시 무효가 된다.
  //      - 지금 기기에는 새 토큰을 발급하므로 프론트는 응답의 access token으로 교체해야 한다. (비밀번호 변경과 같음)
  @Post('logout/all')
  async postLogoutAll(
    @User() user: Pick<Users, 'id'>,
    @SessionId() sessionId: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ){
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.logoutAllDevices(user, sessionId, userAgent);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 로그인된 기기 목록 - current: 지금 요청한 기기
  @Get('sessions')
  getSessions(
    @User() user: Pick<Users, 'id' | 'tokenVersion'>,
    @SessionId() sessionId: string | undefined,
  ){
    return this.authService.getSessions(user, sessionId);
  }

  //* (개인) 특정 기기 로그아웃
  //      - 그 기기의 refresh token이 무효가 된다. 이미 발급된 access token은 만료(최대 10분)까지 유효하다.
  //      - 지금 기기를 지정하면 쿠키도 함께 지운다. (일반 로그아웃과 같은 결과)
  @Delete('sessions/:sessionId')
  async deleteSession(
    @User() user: Pick<Users, 'id'>,
    @SessionId() currentSessionId: string | undefined,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ){
    await this.authService.revokeSession(user, sessionId);

    if( sessionId === currentSessionId ){
      clearRefreshTokenCookie(res);
    }

    return true;
  }

  //* (개인) 회원가입 - 가입 즉시 로그인 (세션 생성)
  @Post('register/emp')
  @IsPublic()
  async postRegisterEmpNo(
    @Body() body: RegisterUserDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.registerWithEmpNo(
      body,
      userAgent,
    );

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 비밀번호 변경 - 다른 기기는 모두 로그아웃, 지금 기기에는 새 토큰 발급
  @Patch('change/pw')
  async patchPassword(
    @User() user: Pick<Users, 'id'>,
    @SessionId() sessionId: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ){
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.changePassword(user, body, sessionId, userAgent);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (관리자) 회원 비밀번호 초기화
  //      - tokenVersion이 올라가 대상 회원의 모든 기기가 로그아웃된다.
  @Patch('reset/pw/:userId')
  @Roles(UserRole.ADMIN)
  patchResetPassword(
    @Param('userId', ParseIntPipe) userId: number,
  ){
    return this.authService.resetPassword(userId);
  }

}
