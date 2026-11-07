import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { UsersService } from "src/users/users.service";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "src/common/decorator/is-public.decorator";
import { TokenUserPayload } from "../types/jwt-payload.type";

/**
 * *[토큰 검증 두 갈래]
 *
 * 1) access token (일반 API, 전역 AccessTokenGuard) → authenticateAccess()
 *    서명·만료·type만 확인하고 req.user를 payload(id·empNo·role·ver)로 채운다. DB 조회 없음.
 *    → 권한 변경·퇴사·비밀번호 변경·모든 기기 로그아웃은 access 만료(최대 10분)까지 반영되지 않는다. (2026-11-07 결정)
 *
 * 2) refresh token (재발급 라우트, RefreshTokenGuard) → authenticate()
 *    서명·만료에 더해 회원 조회 → tokenVersion 일치 → 상태(ACTIVE) 확인.
 *    → 위 변경 사항은 늦어도 다음 재발급에서 막힌다. 새 access에는 DB의 최신 role이 들어간다.
 */
@Injectable()
export class BearerTokenGuard implements CanActivate {

    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService,
        private readonly reflector: Reflector,
    ){}

    async canActivate(context: ExecutionContext): Promise<boolean> {

        const isPublic = this.reflector.getAllAndOverride(
            IS_PUBLIC_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ]
        )

        const req = context.switchToHttp().getRequest();

        if( isPublic ){
            req.isRoutePublic = true;

            // 공개 라우트라도 유효한 accessToken이 함께 왔으면 req.user를 채워둔다.
            // "로그인 없이도 볼 수 있지만, 로그인했으면 개인화된 정보(예: 내가 좋아요했는지)도
            // 함께 보여준다" 같은 케이스를 위한 것. 토큰이 없거나 유효하지 않아도 공개
            // 라우트이므로 에러를 던지지 않고 그냥 비로그인으로 취급한다.
            // 공개 라우트에서도 access token만 로그인으로 인정한다. (authenticateAccess가 type 확인)
            const rawToken = req.headers['authorization'];

            if( rawToken ){
                try{
                    const token = this.authService.extractTokenFromHeader(rawToken, true);
                    this.authenticateAccess(req, token);
                }catch{
                    // 비로그인으로 취급 - 검증 도중 채워진 값은 지운다.
                    req.user = undefined;
                    req.tokenPayload = undefined;
                    req.tokenType = undefined;
                    req.sessionId = undefined;
                }
            }

            return true;
        }

        // access token은 Authorization 헤더에서 꺼낸다.
        const rawToken = req.headers['authorization'];

        if(!rawToken){
            throw new UnauthorizedException('토큰이 없습니다.');
        }

        const token = this.authService.extractTokenFromHeader(rawToken, true);

        this.authenticateAccess(req, token);

        return true;
    }

    //* access token 검증 -> payload로 req.user 채우기 (DB 조회 없음, stateless)
    protected authenticateAccess(req: any, token: string): void {
        const result = this.authService.verifyToken(token);

        if( result.type !== 'access' ){
            throw new UnauthorizedException('Access Token이 아닙니다.');
        }

        // role이 없는 토큰 = 이 방식 이전에 발급된 토큰 → 401로 재발급을 유도한다.
        if( !result.empNo || !result.role ){
            throw new UnauthorizedException('잘못된 토큰입니다.');
        }

        const user: TokenUserPayload = {
            id: result.sub,
            empNo: result.empNo,
            role: result.role,
            tokenVersion: result.ver,
        };

        req.tokenPayload = result;
        req.tokenType = result.type;
        req.sessionId = result.sid;
        req.user = user;
    }

    //* refresh token 검증 -> 사용자 조회 -> tokenVersion·상태 체크 -> req에 저장
    //      - 토큰을 어디서 꺼낼지(헤더/쿠키)는 호출하는 쪽이 정하고, 여기서는 검증만 한다.
    //      - public 여부와 상관없이 무조건 검증한다. (RefreshTokenGuard에서 사용)
    protected async authenticate(req: any, token: string): Promise<void> {
        const result = this.authService.verifyToken(token);

        /**
         * request에 넣을 정보
         *
         * 1) 사용자 정보 - user (DB에서 조회한 최신 회원 → 새 access token의 role도 이 값)
         * 2) 검증된 payload - tokenPayload (재발급 시 sid·jti로 세션 확인)
         * 3) tokenType - access | refresh
         * 4) 세션 id - sessionId
         */
        if( !result.empNo ){
            throw new UnauthorizedException('잘못된 토큰입니다.');
        }

        const user = await this.usersService.getUserByEmpNo(result.empNo);

        if( !user ){
            throw new UnauthorizedException('존재하지 않는 사용자입니다.');
        }

        // 비밀번호 변경 등으로 tokenVersion이 올라갔으면 이전에 발급된 토큰은 거부한다.
        if( result.ver !== user.tokenVersion ){
            throw new UnauthorizedException('만료된 로그인 정보입니다. 다시 로그인해 주세요.');
        }

        this.authService.checkUserStatus(user); // 회원 상태 값 체크

        req.tokenPayload = result;
        req.tokenType = result.type;
        req.sessionId = result.sid;
        req.user = user;
    }
}

//* 전역 가드 - 공개 라우트가 아니면 access token 필수 (검증은 BearerTokenGuard.authenticateAccess)
@Injectable()
export class AccessTokenGuard extends BearerTokenGuard {}

@Injectable()
export class RefreshTokenGuard extends BearerTokenGuard {
    // 토큰 재발급 라우트는 전역 AccessTokenGuard를 건너뛰기 위해 @IsPublic()을 붙이므로,
    // public 여부와 상관없이 항상 검증한다.
    // 여기서는 JWT·회원 단위 검사까지만 하고, 세션(sid·jti) 확인과 교체는 AuthSessionsService.rotateSession이 한다.
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();

        // refresh token은 HttpOnly 쿠키에서 꺼낸다. (cookie-parser 필요)
        const token = req.cookies?.refreshToken;

        if(!token){
            throw new UnauthorizedException('토큰이 없습니다.');
        }

        await this.authenticate(req, token);

        if(req.tokenType !== 'refresh'){
            throw new UnauthorizedException('Refresh Token이 아닙니다.');
        }

        return true;
    }
}
