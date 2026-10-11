import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { UsersService } from "src/users/users.service";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "src/common/decorator/is-public.decorator";

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
            const rawToken = req.headers['authorization'];

            if( rawToken ){
                try{
                    const token = this.authService.extractTokenFromHeader(rawToken, true);
                    const result = await this.authService.verifyToken(token);
                    
                    if( !result.empNo ){
                        throw new UnauthorizedException('잘못된 토큰입니다.');
                    }

                    if( result.type === 'access' ){
                        req.user = await this.usersService.getUserByEmpNo(result.empNo);
                    }

                    if( !req.user ){
                        throw new UnauthorizedException('존재하지 않는 사용자입니다.');
                    }

                }catch{
                    // 무시 - 비로그인으로 취급
                }
            }

            return true;
        }

        const rawToken = req.headers['authorization'];

        if(!rawToken){
            throw new UnauthorizedException('토큰이 없습니다.'); 
        }

        const token = this.authService.extractTokenFromHeader(rawToken, true);

        const result = await this.authService.verifyToken(token);

        /**
         * request에 넣을 정보 
         * 
         * 1) 사용자 정보 - user
         * 2) token - token
         * 3) tokenType - access | refresh
         */
        if( !result.empNo ){
            throw new UnauthorizedException('잘못된 토큰입니다.');
        }

        const user = await this.usersService.getUserByEmpNo(result.empNo);

        if( !user ){
            throw new UnauthorizedException('존재하지 않는 사용자입니다.');
        }

        req.token = token;
        req.tokenType = result.type;
        req.user = user;
        
        return true;
    }
}

@Injectable()
export class AccessTokenGuard extends BearerTokenGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        await super.canActivate(context);

        const req = context.switchToHttp().getRequest();

        if( req.isRoutePublic ){
            return true;
        }

        if(req.tokenType !== 'access'){
            throw new UnauthorizedException('Access Token이 아닙니다.'); 
        }

        return true; 
    }
}

@Injectable()
export class RefreshTokenGuard extends BearerTokenGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        await super.canActivate(context);

        const req = context.switchToHttp().getRequest();

        if( req.isRoutePublic ){
            return true;
        }

        if(req.tokenType !== 'refresh'){
            throw new UnauthorizedException('Refresh Token이 아닙니다.'); 
        }

        return true; 
    }
}