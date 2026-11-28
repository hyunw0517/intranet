import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { UsersService } from "src/users/users.service";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "src/common/decorator/is-public.decorator";
import { TokenUserPayload } from "../types/jwt-payload.type";

/**
 * *[토큰 검증]
 *
 * 1) access token (전역 AccessTokenGuard): 서명·만료·type만 보고 payload로 req.user를 채운다. DB 조회 없음.
 *    그래서 권한 변경·퇴사·비밀번호 변경은 access 만료(최대 10분)까지 반영되지 않는다.
 *
 * 2) refresh token (RefreshTokenGuard): 회원을 조회해 tokenVersion과 상태까지 본다.
 *    위 변경은 늦어도 다음 재발급에서 막히고, 새 access에는 최신 권한이 들어간다.
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

            // 공개 라우트라도 유효한 access token이 오면 req.user를 채운다.
            // 토큰이 잘못돼도 에러 없이 비로그인으로 취급한다.
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

        const rawToken = req.headers['authorization'];

        if(!rawToken){
            throw new UnauthorizedException('토큰이 없습니다.');
        }

        const token = this.authService.extractTokenFromHeader(rawToken, true);

        this.authenticateAccess(req, token);

        return true;
    }

    //* access token 검증 -> payload로 req.user 채우기 (DB 조회 없음)
    protected authenticateAccess(req: any, token: string): void {
        const result = this.authService.verifyToken(token);

        if( result.type !== 'access' ){
            throw new UnauthorizedException('Access Token이 아닙니다.');
        }

        // role이 없으면 이전 방식 토큰이라 401로 재발급시킨다
        if( !result.empNo || !result.role ){
            throw new UnauthorizedException('잘못된 토큰입니다.');
        }

        const user: TokenUserPayload = {
            id: result.sub,
            empNo: result.empNo,
            role: result.role,
            adminPermissions: result.perms ?? [],
            tokenVersion: result.ver,
        };

        req.tokenPayload = result;
        req.tokenType = result.type;
        req.sessionId = result.sid;
        req.user = user;
    }

    //* refresh token 검증 -> 사용자 조회 -> tokenVersion·상태 체크 -> req에 저장
    // 토큰을 어디서 꺼낼지는 호출하는 쪽이 정한다.
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

//* 전역 가드 - 공개 라우트가 아니면 access token 필수
@Injectable()
export class AccessTokenGuard extends BearerTokenGuard {}

@Injectable()
export class RefreshTokenGuard extends BearerTokenGuard {
    // 재발급 라우트는 전역 가드를 건너뛰려고 @IsPublic()을 붙여서, 여기서는 항상 검증한다.
    // 세션(sid·jti) 확인은 AuthSessionsService.rotateSession이 한다.
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
