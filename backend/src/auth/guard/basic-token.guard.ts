import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth.service";

@Injectable()
export class BasicTokenGuard implements CanActivate {
    constructor(
        private readonly authService: AuthService, 
    ){}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        
        const req = context.switchToHttp().getRequest();
        // NestJS가 canActivate에 넘겨주는 context에서 요청 객체를 꺼냄

        const rawToken = req.headers['authorization'];
        // "Basic {인코딩}" 형태"

        if( !rawToken ){
            throw new UnauthorizedException('토큰이 없습니다.'); 
        }

        const token = this.authService.extractTokenFromHeader(rawToken, false);

        const { empNo, password } = this.authService.decodeBasicToken(token);

        const user = await this.authService.authenticateWithEmpNoAndPassword({
            empNo, 
            password, 
        });

        this.authService.checkUserStatus(user);

        req.user = user;

        return true; 

    }
}