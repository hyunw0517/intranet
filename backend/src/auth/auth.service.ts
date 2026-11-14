import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { ENV_HASH_ROUNDS_KEY, ENV_JWT_SECRET } from 'src/common/const/env-keys.const';
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
 * - 로그인·로그아웃·비밀번호는 세션(AuthSessionsService)과 회원(UsersService) 쓰기가 나뉘어 있어 하나의 트랜잭션이 없다.
 *   그래서 마지막 쓰기가 성공한 뒤 기록한다. (회원 생성처럼 한 서비스 안에서 끝나는 쓰기는 그 서비스가 같은 트랜잭션에 기록)
 * - 로그인 전 요청(로그인·가입·로그아웃 쿠키)은 req.user가 없거나 다를 수 있으므로 작업자를 명시한다.
 * - 토큰 재발급(rotation)은 10분마다 일어나는 정상 동작이라 기록하지 않는다. (재사용 감지만 기록)
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

    //* 토큰 검증 (서명 + 만료만 확인)
    //    - tokenVersion·회원 상태·세션은 가드와 AuthSessionsService가 따로 확인한다.
    //    - algorithms를 지정해 서버가 허용할 알고리즘을 정한다. (헤더의 alg를 믿지 않음 → alg: none 등 차단)
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

  //* Access Token 생성 - stateless (검증할 때 회원·세션 DB를 보지 않음)
  //    - role·perms: RolesGuard가 이 값으로 권한을 판단한다. 권한이 바뀌면 다음 재발급(최대 10분)부터 반영된다.
  //      (관리자 권한 회수·강등은 UsersService가 tokenVersion을 올려 재발급을 막는다 → 다시 로그인해야 함)
  //    - sid는 "지금 기기" 표시(기기 목록)와 전체 로그아웃·비밀번호 변경 시 현재 기기 유지에 쓴다.
  private signAccessToken( user: TokenUser, sessionId: string ){
    return this.jwtService.sign({
        empNo: user.empNo,
        sub: user.id,
        type: 'access',
        ver: user.tokenVersion, // 발급 당시 tokenVersion (access 검증에서는 비교하지 않음, 재발급 때 refresh로 비교)
        role: user.role,
        perms: user.adminPermissions, // ADMIN이 아니면 빈 배열
        sid: sessionId,
    }, {
        secret: this.configService.get<string>(ENV_JWT_SECRET),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN, // 유효시간 (unit: seconds)
    });
  }

  //* Refresh Token 생성 - sid + jti로 세션 테이블과 연결
  //    - 유효시간은 1일(유휴 만료)이지만, 세션 절대 만료(7일)가 더 가까우면 그때까지만 준다.
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
  //    - refreshTokenMaxAge는 컨트롤러가 쿠키 maxAge로 쓴다. (토큰 만료와 쿠키 만료를 맞춤)
  private issueTokens( user: TokenUser, session: SessionForToken ){
    const refresh = this.signRefreshToken(user, session);

    return {
      accessToken: this.signAccessToken(user, session.id),
      refreshToken: refresh.token,
      refreshTokenMaxAge: refresh.expiresIn,
    };
  }

  //* 로그인(가입) - 세션을 새로 만들고 토큰 발급
  async loginUser( user: TokenUser, userAgent?: string ) {
    const session = await this.authSessionsService.createSession(user, userAgent);

    // 로그인 성공 → 실패 횟수·잠금 단계 초기화 (가입 직후 로그인은 행이 없어 아무것도 하지 않음)
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

  //* 토큰 재발급 - refresh token 교체(rotation) + 새 access token
  //    - RefreshTokenGuard가 서명·만료·type·tokenVersion·회원 상태를 확인한 뒤 호출된다.
  //    - 재발급할 때마다 refresh token도 새 것으로 바뀐다. 옛 refresh token을 다시 쓰면 재사용으로 감지된다.
  async reissueTokens( payload: JwtPayload, user: TokenUser ){
    if( payload.type !== 'refresh' ){
      throw new UnauthorizedException('잘못된 토큰 방식입니다.');
    }

    const session = await this.authSessionsService.rotateSession(payload, user);

    return this.issueTokens(user, session);
  }

  //* 로그아웃 - 이 기기의 세션만 폐기 (다른 기기는 그대로)
  //    - 쿠키가 없거나 이미 무효인 토큰이어도 로그아웃(쿠키 삭제)은 진행되어야 하므로 예외를 던지지 않는다.
  //    - 이 기기의 access token은 만료(최대 10분)까지 유효하지만, 프론트가 메모리에서 지운다.
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
        actorId: payload.sub, // 로그아웃은 access token 없이 refresh 쿠키로 오므로 req.user가 없다
      });
    }
  }

  //* 모든 기기에서 로그아웃 - 지금 기기만 유지
  //    - tokenVersion을 올려 모든 access·refresh 토큰을 즉시 무효화한다. (가드가 요청마다 ver을 비교)
  //    - 지금 기기의 세션은 새 tokenVersion으로 갱신하고 새 토큰을 발급한다. (비밀번호 변경과 같은 방식)
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
  //  1. 잠긴 사번이면 비밀번호를 확인하지 않고 429
  //  2. 회원 조회 + 비밀번호 확인 (없는 사번도 같은 시간이 걸리도록 가짜 해시와 비교)
  //  3. 실패: 감사 로그 + 실패 횟수 (5회째면 잠금 → 429), 응답 메시지는 원인과 무관하게 같다 (등록된 사번 노출 방지)
  //  4. 성공: 찾은 회원 반환 (실패 횟수 초기화는 로그인이 끝난 loginUser에서)
  async authenticateWithEmpNoAndPassword(
    user: Pick<Users, 'empNo' | 'password'>
  ){
      await this.loginHistoryService.assertNotLocked( user.empNo );

      const existingUser = await this.usersService.getUserWithPasswordByEmpNo(user.empNo);

      // 없는 사번이면 bcrypt 비교를 건너뛰어 응답이 빨라지므로, 응답 시간으로 등록 여부를 알 수 없도록 가짜 해시와 비교한다.
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

  //* 없는 사번 비교용 가짜 해시 (처음 한 번만 만든다. 실제 해시와 같은 cost라 비교 시간이 같다)
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

  //* 로그인 시 재직 상태 확인 (BasicTokenGuard) - 실패하면 감사 로그를 남기고 예외를 그대로 던진다.
  //  - checkUserStatus는 재발급 가드에서도 쓰므로 로그인 전용으로 감싼다.
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
  //  - 시도한 사람은 알 수 없으므로 작업자는 NULL, 대상은 그 사번의 회원(없으면 NULL)
  //  - 시도한 사번은 detail에 남긴다. (비밀번호는 남기지 않음)
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

  //* 회원가입
  async registerWithEmpNo(
    user: RegisterUserDto,
    userAgent?: string,
  ){

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
  //    - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
  //    - 새 비밀번호가 현재 비밀번호와 같으면 변경하지 않는다.
  //    - tokenVersion이 올라가 기존 토큰(다른 기기 포함)은 모두 무효가 되므로,
  //      지금 기기의 세션만 새 tokenVersion으로 갱신하고 새 토큰을 발급해 응답한다.
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
  //    - 서버가 임시 비밀번호를 생성해 저장하고, 평문은 응답으로 한 번만 돌려준다. (DB에는 해시만 저장)
  //    - updatePassword가 tokenVersion을 올리므로 대상 회원의 기존 토큰은 모두 무효가 된다.
  //    - 변경 대상이 관리자 본인이 아니므로 토큰을 발급하지 않는다.
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

    // 비밀번호를 잊어 잠긴 회원이 임시 비밀번호로 바로 로그인할 수 있도록 잠금도 해제한다.
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
  //    - Math.random()은 예측 가능하므로 비교적 안전한 crypto.randomInt 사용.
  private generateTemporaryPassword(){
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';

    let password = '';
    for( let i = 0; i < 12; i++ ){
      password += chars[randomInt(chars.length)];
    }

    return password;
  }

}
