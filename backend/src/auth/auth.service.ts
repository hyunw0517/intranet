import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { RegisterConsentDto, RegisterUserDto } from './dto/register-user.dto';
import { CURRENT_CONSENT_VERSIONS } from 'src/users/const/consent.const';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { ENV_COMPANY_NAME_KEY, ENV_HASH_ROUNDS_KEY, ENV_JWT_SECRET } from 'src/common/const/env-keys.const';
import { AuditActionType, AuditTargetType, Users, UserStatus } from 'src/generated/prisma/client';
import { ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN } from './const/token-const';
import { JwtPayload } from './types/jwt-payload.type';
import { AuthSessionsService, SessionForToken } from './auth-sessions.service';
import { AuditService, TargetAudit } from 'src/common/audit.service';
import { LoginHistoryService } from './login-history.service';
import { LOGIN_FAILED_MESSAGE } from './const/login-lock.const';

type TokenUser = Pick<Users, 'id' | 'empNo' | 'role' | 'adminPermissions' | 'tokenVersion'>;
type SessionUser = Pick<Users, 'id' | 'tokenVersion'>;

//* 로그인 실패 사유 (감사 로그 detail.reason)
type LoginFailReason = 'NOT_FOUND' | 'WRONG_PASSWORD' | 'NOT_ACTIVE';

/**
 * *[감사 로그]
 * - 세션과 회원 쓰기가 서비스별로 나뉘어 한 트랜잭션이 아니라서, 마지막 쓰기가 끝난 뒤 기록한다.
 * - 로그인 전 요청은 req.user가 없어서 작업자를 직접 넣는다.
 * - 토큰 재발급은 10분마다 일어나는 정상 동작이라 남기지 않는다. 재사용 감지만 남긴다.
 */
@Injectable()
export class AuthService {

  private readonly audit: TargetAudit;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly authSessionsService: AuthSessionsService,
    auditService: AuditService,
    private readonly loginHistoryService: LoginHistoryService,
  ){
    this.audit = auditService.target( AuditTargetType.USER );
  }

    /**
     * *[토큰 사용 방식]
     * 1) 사용자가 로그인 또는 회원가입 진행 시 
     *      accessToken, refreshToken 발급
     * 2) 로그인 시 Basic 토큰과 함께 요청을 받는다. 
     *      Basic 토큰은 '이메일:비밀번호'를 Base64로 인코딩한 형태이다. 
     *      ex) { authorization: 'Basic {token}' }
     * 3) 아무나 접근할 수 없는 정보 (private route)를 접근 할 때는
     *      accessToken을 Header에 추가해서 요청과 함께 보낸다. 
     *      ex) { authorization: 'Bearer {token}' }
     * 4) 토큰과 요청을 함께 받은 서버는 토큰 검증을 통해 현재 요청을 보낸 사용자가 누군지 알 수 있다. 
     *    예를 들어, 현재 로그인 한 사용자가 작성한 포스트만 가져오려면 
     *    토큰의 sub 값에 입력되어 있는 사용자의 포스트만 따로 필터링 할 수 있다. 
     *    특정 사용자의 토큰이 없다면 다른 사용자의 데이터 접근 불가하다. 
     * 5) 모든 토큰은 만료 기간이 있다. 만료 기간이 지나면 새로 토큰을 발급 받아야 한다. 
     *    그렇지 않으면 jwtService.verify()에서 인증 통과가 불가하다. 
     *    access 토큰을 새로 발급 받을 수 있는 /auth/token/access, 
     *    refresh 토큰을 새로 발급 받을 수 있는 /auth/token/refresh 필요
     * 6) 토큰이 만료되면 각각의 토큰을 새로 발급 받을 수 있는 엔드포인트에 요청해서 
     *    새로운 토큰을 발급 받고 해당 토큰으로 private route에 접근한다. 
     */

    // 헤더 값 검증 후 토큰 값만 반환
    extractTokenFromHeader( header: string, isBearer: boolean ){
      const splitToken = header.split(' ');
      const prefix = isBearer ? 'Bearer' : 'Basic';

      if( splitToken.length !== 2 || splitToken[0] !== prefix ){
        throw new UnauthorizedException('잘못된 토큰입니다.');
      }

      const token = splitToken[1]; 

      return token; 
    }

    /**
     * * Basic 토큰 decode
     * - empNo:password -> [empNo, password]
     */
    decodeBasicToken( base64String: string ){
        const decoded = Buffer.from(base64String, 'base64').toString('utf8'); // base64를 utf8로 디코딩

        const idx = decoded.indexOf(':');

        if( idx <= 0 ){
            throw new UnauthorizedException('잘못된 유형의 토큰입니다.');
        }

        const empNo = decoded.slice(0, idx); 
        const password = decoded.slice(idx + 1); 

        return {
            empNo, 
            password, 
        }
    }

    //* 토큰 검증 (서명·만료만)
    // algorithms를 고정해서 헤더의 alg를 믿지 않는다 (alg: none 차단).
    verifyToken( token: string ): JwtPayload {
      try{
        return this.jwtService.verify<JwtPayload>(token, {
          secret: this.configService.get<string>(ENV_JWT_SECRET),
          algorithms: ['HS256'],
        });
      }catch{
        throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
      }
    }

  //* Access Token 생성 (stateless)
  // role·perms는 RolesGuard가 쓴다. 권한이 바뀌면 다음 재발급부터 반영된다.
  // sid는 기기 목록의 "지금 기기" 표시와 현재 기기 유지에 쓴다.
  private signAccessToken( user: TokenUser, sessionId: string ){
    return this.jwtService.sign({
        empNo: user.empNo,
        sub: user.id,
        type: 'access',
        ver: user.tokenVersion, // access 검증에서는 비교하지 않는다
        role: user.role,
        perms: user.adminPermissions, // ADMIN이 아니면 빈 배열
        sid: sessionId,
    }, {
        secret: this.configService.get<string>(ENV_JWT_SECRET),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN, // 유효시간 (unit: seconds)
    });
  }

  //* Refresh Token 생성 (sid + jti로 세션과 연결)
  // 유효시간은 1일이지만 세션 절대 만료(7일)가 더 가까우면 그때까지만 준다.
  private signRefreshToken( user: TokenUser, session: SessionForToken ){
    const secondsUntilSessionEnd = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    const expiresIn = Math.min(REFRESH_TOKEN_EXPIRES_IN, secondsUntilSessionEnd);

    if( expiresIn <= 0 ){
      throw new UnauthorizedException('로그인 유지 기간이 지났습니다. 다시 로그인해 주세요.');
    }

    const token = this.jwtService.sign({
        empNo: user.empNo,
        sub: user.id,
        type: 'refresh',
        ver: user.tokenVersion,
        sid: session.id,
        jti: session.currentJti,
    }, {
        secret: this.configService.get<string>(ENV_JWT_SECRET),
        expiresIn,
    });

    return { token, expiresIn };
  }

  //* 세션 기준으로 access + refresh 발급
  // 로그인 유지를 안 고른 세션은 maxAge 없이 세션 쿠키로 내려간다.
  private issueTokens( user: TokenUser, session: SessionForToken ){
    const refresh = this.signRefreshToken(user, session);

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken: refresh.token,
      refreshTokenMaxAge: session.rememberMe ? refresh.expiresIn : undefined,
    };
  }

  //* 로그인(가입) - 세션 생성 후 토큰 발급
  // 가입 직후 자동 로그인은 체크 항목이 없어서 rememberMe를 true로 둔다.
  async loginUser( user: TokenUser, userAgent?: string, rememberMe: boolean = true ) {
    const session = await this.authSessionsService.createSession(user, userAgent, rememberMe);

    // 실패 횟수·잠금 단계 초기화
    await this.loginHistoryService.reset(user.empNo);

    await this.audit.log({
      targetId: user.id,
      actionType: AuditActionType.LOGIN,
      content: `로그인: ${user.empNo}`,
      detail: { sessionId: session.id },
      actorId: user.id,
    });

    return this.issueTokens(user, session);
  }

  //* 토큰 재발급 (refresh token rotation)
  // RefreshTokenGuard가 토큰·회원 검사를 끝낸 뒤 호출된다.
  async reissueTokens( payload: JwtPayload, user: TokenUser ){
    if( payload.type !== 'refresh' ){
      throw new UnauthorizedException('잘못된 토큰 방식입니다.');
    }

    const session = await this.authSessionsService.rotateSession(payload, user);

    return this.issueTokens(user, session);
  }

  //* 로그아웃 - 이 기기 세션만 폐기
  // 쿠키가 없거나 무효여도 쿠키 삭제는 해야 해서 예외를 던지지 않는다.
  async logout( refreshToken?: string ){
    if( !refreshToken ){
      return;
    }

    let payload: JwtPayload;

    try{
      payload = this.verifyToken(refreshToken);
    }catch{
      return;
    }

    if( payload.type !== 'refresh' || !payload.sid ){
      return;
    }

    const revoked = await this.authSessionsService.revokeSession(payload.sid, payload.sub);

    if( revoked ){
      await this.audit.log({
        targetId: payload.sub,
        actionType: AuditActionType.LOGOUT,
        content: `로그아웃: ${payload.empNo}`,
        detail: { sessionId: payload.sid },
        actorId: payload.sub, // refresh 쿠키로만 오는 요청이라 req.user가 없다
      });
    }
  }

  //* 모든 기기에서 로그아웃 - 지금 기기만 유지
  // tokenVersion을 올려 다른 기기의 재발급을 막고, 지금 세션은 새 버전으로 갱신해 새 토큰을 준다.
  async logoutAllDevices( user: Pick<Users, 'id'>, currentSessionId?: string, userAgent?: string ){
    const updatedUser = await this.usersService.increaseTokenVersion(user.id);

    const session = await this.authSessionsService.renewSession(currentSessionId, updatedUser, userAgent);

    await this.audit.log({
      targetId: user.id,
      actionType: AuditActionType.LOGOUT,
      content: `모든 기기에서 로그아웃 (현재 기기 유지): ${updatedUser.empNo}`,
      detail: { allDevices: true, keptSessionId: session.id },
    });

    return this.issueTokens(updatedUser, session);
  }

  //* 로그인된 기기 목록
  getSessions( user: SessionUser, currentSessionId?: string ){
    return this.authSessionsService.getActiveSessions(user, currentSessionId);
  }

  //* 특정 기기 로그아웃 (본인 세션만)
  async revokeSession( user: Pick<Users, 'id'>, sessionId: string ){
    const revoked = await this.authSessionsService.revokeSession(sessionId, user.id);

    if( !revoked ){
      throw new NotFoundException('로그인 기기를 찾을 수 없습니다.');
    }

    await this.audit.log({
      targetId: user.id,
      actionType: AuditActionType.LOGOUT,
      content: '다른 기기 로그아웃',
      detail: { sessionId },
    });
  }

  //* 로그인 시 사번/패스워드 검증
  // 실패 메시지는 원인과 상관없이 같다 (등록된 사번 노출 방지).
  async authenticateWithEmpNoAndPassword(
    user: Pick<Users, 'empNo' | 'password'>
  ){
      await this.loginHistoryService.assertNotLocked( user.empNo );

      const existingUser = await this.usersService.getUserWithPasswordByEmpNo(user.empNo);

      // 없는 사번도 가짜 해시와 비교해서 응답 시간으로 등록 여부를 알 수 없게 한다
      const passwordOk = await bcrypt.compare( user.password, existingUser?.password ?? await this.getDummyHash() );

      if( !existingUser || !passwordOk ){
        const userId = existingUser?.id ?? null;

        await this.logLoginFailure( user.empNo, userId, existingUser ? 'WRONG_PASSWORD' : 'NOT_FOUND' );

        const lock = await this.loginHistoryService.recordFailure( user.empNo, userId );

        if( lock ){
          await this.audit.log({
            targetId: userId,
            actionType: AuditActionType.LOGIN_LOCKED,
            content: `로그인 잠금 ${lock.lockLevel}단계: ${user.empNo}`,
            detail: { empNo: user.empNo, lockLevel: lock.lockLevel, lockedUntil: lock.lockedUntil },
            actorId: null,
          });

          throw this.loginHistoryService.lockedException( lock.lockedUntil );
        }

        throw new UnauthorizedException( LOGIN_FAILED_MESSAGE );
      }

      return existingUser;
  }

  //* 없는 사번 비교용 가짜 해시 (처음 한 번만 만든다)
  private dummyHash?: Promise<string>;
  private getDummyHash(){
    this.dummyHash ??= this.hashPassword( randomUUID() );
    return this.dummyHash;
  }

  //* (관리자) 로그인 잠금 해제 - 실패 횟수·단계도 함께 초기화
  async unlockLogin( user: Pick<Users, 'role'>, userId: number ){
    const targetUser = await this.usersService.getUserDetail(userId);

    // 관리자 계정은 슈퍼관리자만
    this.usersService.assertCanManageAccount(user, targetUser);

    const unlocked = await this.loginHistoryService.reset( targetUser.empNo );

    if( unlocked ){
      await this.audit.log({
        targetId: userId,
        actionType: AuditActionType.LOGIN_UNLOCKED,
        content: `(관리자) 로그인 잠금 해제: ${targetUser.name}(${targetUser.empNo})`,
      });
    }

    return { unlocked };
  }

  //* 로그인 시 재직 상태 확인 (실패하면 감사 로그)
  // checkUserStatus는 재발급 가드도 써서 로그인용으로 따로 감쌌다.
  async checkLoginStatus(
    user: Pick<Users, 'id' | 'empNo' | 'status'>
  ){
    try{
      this.checkUserStatus(user);
    }catch( e ){
      await this.logLoginFailure( user.empNo, user.id, 'NOT_ACTIVE', user.status );
      throw e;
    }
  }

  //* 로그인 실패 감사 로그
  // 시도한 사람은 알 수 없어서 작업자는 NULL로 둔다. 비밀번호는 남기지 않는다.
  private logLoginFailure( empNo: string, userId: number | null, reason: LoginFailReason, status?: UserStatus ){
    return this.audit.log({
      targetId: userId,
      actionType: AuditActionType.LOGIN_FAILED,
      content: `로그인 실패: ${empNo}`,
      detail: { empNo, reason, ...( status && { status } ) },
      actorId: null,
    });
  }

  //* 사용자 상태 체크 -> 재직(ACTIVE) 상태만 로그인 허용
  checkUserStatus(
    user: Pick<Users, 'status'>
  ){
      switch( user.status ) {
          case UserStatus.ACTIVE:
              return;
          case UserStatus.INACTIVE:
              throw new ForbiddenException('비활성화된 계정입니다. 관리자에게 문의하세요.');
          case UserStatus.RESIGNED:
              throw new ForbiddenException('퇴사 처리된 계정입니다.');
          default:
              throw new ForbiddenException('로그인할 수 없는 계정입니다.');
      }
  }

  //* 비밀번호 해시 생성
  //    - 회원가입, 비밀번호 변경에서 공통으로 사용
  hashPassword(
    password: string
  ){
    return bcrypt.hash(
        password,
        parseInt(
          this.configService.get<string>(ENV_HASH_ROUNDS_KEY) ?? '10'
        ),
    );
  }

  //* 동의 화면 정보 (개인정보처리자를 밝혀야 해서 값이 없으면 오류)
  getConsentInfo(){
    return { companyName: this.configService.getOrThrow<string>(ENV_COMPANY_NAME_KEY) };
  }

  //* 필수 동의 확인 (모든 항목을 현재 버전으로)
  private assertAgreedToCurrentConsents( consents: RegisterConsentDto[] ){
    const agreedAll = Object.entries(CURRENT_CONSENT_VERSIONS).every( ([type, version]) =>
      consents.some( (consent) => consent.type === type && consent.version === version )
    );

    if( !agreedAll ){
      throw new BadRequestException('필수 약관에 동의해 주세요. 약관이 변경된 경우 새로고침 후 다시 동의해 주세요.');
    }
  }

  //* 회원가입
  async registerWithEmpNo(
    user: RegisterUserDto,
    userAgent?: string,
  ){

    this.assertAgreedToCurrentConsents(user.consents);

    const hash = await this.hashPassword(user.password);

    const newUser = await this.usersService.createUser({
      empNo: user.empNo,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      password: hash,
      birthday: user.birthday,
      hp: user.hp,
      tel: user.tel,
    });

    return this.loginUser(newUser, userAgent);
  }

  //* 비밀번호 변경
  // tokenVersion이 올라가 다른 기기는 로그아웃되고, 지금 기기만 새 토큰을 받는다.
  async changePassword(
    user: Pick<Users, 'id'>,
    body: ChangePasswordDto,
    currentSessionId?: string,
    userAgent?: string,
  ){
    const hash = await this.usersService.getPasswordHashById(user.id);
    await this.usersService.verifyPassword({ password: hash }, body.currentPassword);

    if( body.currentPassword === body.newPassword ){
      throw new BadRequestException('새 비밀번호가 현재 비밀번호와 같습니다.');
    }

    const newHash = await this.hashPassword(body.newPassword);

    const updatedUser = await this.usersService.updatePassword(user.id, newHash);

    const session = await this.authSessionsService.renewSession(currentSessionId, updatedUser, userAgent);

    await this.audit.log({
      targetId: user.id,
      actionType: AuditActionType.PASSWORD_CHANGE,
      content: `비밀번호 변경: ${updatedUser.empNo}`,
    });

    return this.issueTokens(updatedUser, session);
  }

  //* (관리자) 비밀번호 초기화
  // 임시 비밀번호는 응답으로 한 번만 주고 DB에는 해시만 남긴다.
  async resetPassword(
    user: Pick<Users, 'role'>,
    userId: number
  ){
    const targetUser = await this.usersService.getUserDetail(userId);

    // 관리자 계정은 슈퍼관리자만
    this.usersService.assertCanManageAccount(user, targetUser);

    const temporaryPassword = this.generateTemporaryPassword();

    const newHash = await this.hashPassword(temporaryPassword);

    await this.usersService.updatePassword(userId, newHash);

    // 잠긴 회원이 임시 비밀번호로 바로 로그인할 수 있게 잠금도 푼다
    const unlocked = await this.loginHistoryService.reset(targetUser.empNo);

    // 임시 비밀번호는 남기지 않는다.
    await this.audit.log({
      targetId: userId,
      actionType: AuditActionType.PASSWORD_RESET,
      content: `(관리자) 비밀번호 초기화: ${targetUser.name}(${targetUser.empNo})`,
      detail: { loginUnlocked: unlocked },
    });

    return { temporaryPassword };
  }

  //* 임시 비밀번호 생성 (12자리)
  // Math.random()은 예측할 수 있어서 crypto.randomInt를 쓴다.
  private generateTemporaryPassword(){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';

    let password = '';
    for( let i = 0; i < 12; i++ ){
      password += chars[randomInt(chars.length)];
    }

    return password;
  }

}
