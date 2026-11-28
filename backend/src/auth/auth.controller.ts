import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Request, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginOptionsDto } from './dto/login-options.dto';
import { User } from './decorator/user.decorator';
import { SessionId } from './decorator/session-id.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { AdminPermission, type Users } from 'src/generated/prisma/client';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { RefreshTokenGuard } from './guard/bearer-token.guard';
import { BasicTokenGuard } from './guard/basic-token.guard';
import type { Response } from 'express';
import { clearRefreshTokenCookie, setRefreshTokenCookie } from './const/refresh-cookie-const';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiBadRequestResponse, ApiBasicAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AccessTokenResponse, AuthSessionResponse, ConsentInfoResponse, TemporaryPasswordResponse, UnlockLoginResponse } from './dto/auth-response.dto';

@ApiTags('Auth (인증)')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  //* (개인) 쿠키의 Refresh 토큰 -> Access 토큰 재발급 + Refresh 토큰 교체(rotation)
  @Post('token/access')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  @ApiOperation({ summary: 'access token 재발급', description: 'refresh 쿠키(Path=/api/auth, 브라우저가 자동 전송)로 새 access token을 발급한다. refresh token도 매번 새 것으로 바뀐다(rotation). 프론트는 401을 받으면 이 API를 한 번 호출하고 원래 요청을 다시 보낸다.' })
  @ApiUnauthorizedResponse({ description: 'refresh 쿠키 없음·만료·폐기, 재사용 감지(보안 로그아웃) → 다시 로그인' })
  async postTokenAccess(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse>{
    // RefreshTokenGuard가 쿠키에서 꺼내 검증한 payload와 사용자
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.reissueTokens(req.tokenPayload, req.user);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 쿠키의 Refresh 토큰 -> Refresh 토큰 재발급 (쿠키로 다시 저장)
  // refresh만 필요할 때를 위해 남겨 둔 API
  @Post('token/refresh')
  @IsPublic()
  @UseGuards(RefreshTokenGuard)
  @ApiOperation({ summary: 'refresh token만 재발급', description: 'token/access와 같은 교체 로직으로 refresh 쿠키만 새로 저장한다. 응답 본문은 true.' })
  @ApiUnauthorizedResponse({ description: 'refresh 쿠키 없음·만료·폐기, 재사용 감지(보안 로그아웃) → 다시 로그인' })
  async postTokenRefresh(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ): Promise<boolean>{
    const { refreshToken, refreshTokenMaxAge } = await this.authService.reissueTokens(req.tokenPayload, req.user);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return true;
  }

  //* (개인) 회원 로그인 요청 - 세션(기기) 1개 생성
  // ThrottlerGuard를 BasicTokenGuard보다 먼저 둬서 넘친 요청은 비밀번호 확인 없이 429
  @Post('login/emp')
  @IsPublic()
  @ApiBasicAuth('basic') // 문서: Authorization: Basic base64(사번:비밀번호)
  @UseGuards(ThrottlerGuard, BasicTokenGuard)
  @ApiOperation({ summary: '로그인 (사번·비밀번호)', description: '`Authorization: Basic base64(사번:비밀번호)`로 보낸다(문서의 Authorize → basic). 성공하면 access token을 응답하고 refresh token은 HttpOnly 쿠키로 저장한다. 로그인마다 기기 세션 1개가 생긴다. `rememberMe: false`면 refresh 쿠키를 세션 쿠키로 발급한다(브라우저를 닫으면 로그아웃).' })
  @ApiUnauthorizedResponse({ description: '사번 또는 비밀번호가 올바르지 않음 (원인을 구분하지 않는다)' })
  @ApiForbiddenResponse({ description: '로그인할 수 없는 계정 상태 (비활성화·퇴사 등)' })
  @ApiTooManyRequestsResponse({ description: 'IP 요청 수 제한 초과, 또는 계정 잠금(5회 실패마다 10분 → 30분 → 1시간)' })
  async postLoginEmpNo(
    @Request() req: any,
    @Body() body: LoginOptionsDto,
    @Headers('user-agent') userAgent: string | undefined, // 기기 목록 표시용
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ): Promise<AccessTokenResponse>{
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.loginUser( req.user, userAgent, body?.rememberMe ?? true );

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 로그아웃 - refreshToken 쿠키 삭제 + 이 기기의 세션 폐기
  // access token이 만료돼도 로그아웃할 수 있게 공개 라우트로 둔다.
  @Post('logout')
  @IsPublic()
  @ApiOperation({ summary: '로그아웃 (이 기기)', description: 'refresh 쿠키를 지우고 이 기기의 세션을 폐기한다. access token이 만료된 상태에서도 쓸 수 있게 공개 라우트다. 다른 기기의 로그인은 유지된다. 응답 본문은 true.' })
  async postLogout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<boolean>{
    // DB 처리가 실패해도 쿠키는 지워지게 먼저 삭제한다
    clearRefreshTokenCookie(res);

    await this.authService.logout(req.cookies?.refreshToken);

    return true;
  }

  //* (개인) 모든 기기에서 로그아웃 - 지금 기기만 유지
  // 프론트는 응답의 access token으로 바꿔야 한다.
  @Post('logout/all')
  @ApiOperation({ summary: '모든 기기에서 로그아웃 (지금 기기만 유지)', description: 'tokenVersion이 올라가 다른 기기의 access·refresh 토큰이 즉시 무효가 된다. 지금 기기에는 새 토큰을 발급하므로 응답의 access token으로 교체해야 한다.' })
  async postLogoutAll(
    @User() user: Pick<Users, 'id'>,
    @SessionId() sessionId: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse>{
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.logoutAllDevices(user, sessionId, userAgent);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 로그인된 기기 목록
  @Get('sessions')
  @ApiOperation({ summary: '로그인된 기기 목록', description: '마지막 재발급 시각 최신순. `current`가 true인 행이 지금 요청한 기기다.' })
  getSessions(
    @User() user: Pick<Users, 'id' | 'tokenVersion'>,
    @SessionId() sessionId: string | undefined,
  ): Promise<AuthSessionResponse[]>{
    return this.authService.getSessions(user, sessionId);
  }

  //* (개인) 특정 기기 로그아웃
  // 지금 기기를 고르면 쿠키도 지운다.
  @Delete('sessions/:sessionId')
  @ApiOperation({ summary: '특정 기기 로그아웃', description: '그 기기의 refresh token이 무효가 된다. 이미 발급된 access token은 만료(최대 10분)까지 유효하다. 지금 기기를 지정하면 쿠키도 함께 지운다. 응답 본문은 true.' })
  @ApiBadRequestResponse({ description: 'sessionId가 uuid 형식이 아님' })
  @ApiNotFoundResponse({ description: '내 기기 중에 해당 세션이 없음' })
  async deleteSession(
    @User() user: Pick<Users, 'id'>,
    @SessionId() currentSessionId: string | undefined,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<boolean>{
    await this.authService.revokeSession(user, sessionId);

    if( sessionId === currentSessionId ){
      clearRefreshTokenCookie(res);
    }

    return true;
  }

  //* 회원가입 동의 화면 정보 (로그인 전 화면이라 공개)
  @Get('consent-info')
  @IsPublic()
  @ApiOperation({ summary: '회원가입 동의 화면 정보', description: '로그인 전 화면에서 쓰므로 공개 라우트다.' })
  getConsentInfo(): ConsentInfoResponse{
    return this.authService.getConsentInfo();
  }

  //* (개인) 회원가입 - 가입 즉시 로그인 (세션 생성)
  @Post('register/emp')
  @IsPublic()
  @UseGuards(ThrottlerGuard) // 로그인 없이 쓰는 API라 IP당 요청 수 제한
  @ApiOperation({ summary: '회원가입 (사번)', description: '가입 즉시 로그인한다(기기 세션 생성, refresh 쿠키 저장). 필수 약관(이용약관·개인정보 수집·이용)을 현재 버전으로 모두 동의해야 한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 필수 약관 미동의·버전 불일치, 이미 사용 중인 사원번호·이메일' })
  @ApiTooManyRequestsResponse({ description: 'IP 요청 수 제한 초과' })
  async postRegisterEmpNo(
    @Body() body: RegisterUserDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ): Promise<AccessTokenResponse>{
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.registerWithEmpNo(
      body,
      userAgent,
    );

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (개인) 비밀번호 변경 - 다른 기기는 모두 로그아웃, 지금 기기에는 새 토큰 발급
  @Patch('change/pw')
  @ApiOperation({ summary: '비밀번호 변경', description: '현재 비밀번호로 본인 확인 후 바꾼다. 다른 기기는 모두 로그아웃되고, 지금 기기에는 새 토큰을 발급하므로 응답의 access token으로 교체해야 한다.' })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 현재 비밀번호 불일치, 새 비밀번호가 현재와 같음' })
  async patchPassword(
    @User() user: Pick<Users, 'id'>,
    @SessionId() sessionId: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response, // refreshToken 쿠키 저장용도
  ): Promise<AccessTokenResponse>{
    const { accessToken, refreshToken, refreshTokenMaxAge } = await this.authService.changePassword(user, body, sessionId, userAgent);

    setRefreshTokenCookie(res, refreshToken, refreshTokenMaxAge);

    return { accessToken };
  }

  //* (관리자) 회원 비밀번호 초기화
  @Patch('reset/pw/:userId')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 비밀번호 초기화', description: '서버가 임시 비밀번호를 만들어 응답으로 한 번만 돌려준다. 대상 회원의 모든 기기가 로그아웃되고(tokenVersion 증가), 로그인 잠금도 함께 해제된다. 관리자 계정은 슈퍼관리자만 초기화할 수 있다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 회원' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 대상이 관리자 계정인데 슈퍼관리자가 아님' })
  patchResetPassword(
    @User() user: Pick<Users, 'role'>,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<TemporaryPasswordResponse>{
    return this.authService.resetPassword(user, userId);
  }

  //* (관리자) 회원 로그인 잠금 해제 - 실패 횟수·잠금 단계 초기화
  @Patch('unlock/:userId')
  @RequireAdmin(AdminPermission.USERS)
  @ApiOperation({ summary: '(관리자) 회원 로그인 잠금 해제', description: '로그인 실패 횟수·잠금 단계를 초기화한다. 지울 기록이 없으면 `unlocked: false`(오류 아님). 관리자 계정은 슈퍼관리자만 해제할 수 있다.' })
  @ApiBadRequestResponse({ description: '존재하지 않는 회원' })
  @ApiForbiddenResponse({ description: '권한 없음, 또는 대상이 관리자 계정인데 슈퍼관리자가 아님' })
  patchUnlockLogin(
    @User() user: Pick<Users, 'role'>,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<UnlockLoginResponse>{
    return this.authService.unlockLogin(user, userId);
  }

}
