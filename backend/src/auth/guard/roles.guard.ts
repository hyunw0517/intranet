import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorator/roles.decorator";
import { AdminPermission, UserRole } from "src/generated/prisma/client";
import { ROLE_LEVEL } from "../const/role-level.const";
import { ADMIN_PERMISSION_KEY } from "../decorator/require-admin.decorator";
import { hasAdminPermission } from "../util/admin-permission.util";
import { TokenUserPayload } from "../types/jwt-payload.type";

//* 로그인한 사용자의 role(권한)이 특정 라우트에 접근할 수 있는지 확인하는 Guard
//  1) 등급: @Roles(role) 이상인지 (ROLE_LEVEL)
//  2) 관리자 기능: @RequireAdmin(permission)이면 그 기능을 가졌는지 (SUPER_ADMIN은 전부)
//  - 둘 다 access token payload(req.user)만 본다. (DB 조회 없음, 권한 변경은 다음 재발급부터 반영)
@Injectable()
export class RolesGuard implements CanActivate {

    constructor(
        private readonly reflector: Reflector, 
    ){}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        /**
         * Roles annotation에 대한 metadata를 가져와야 한다. 
         * 
         * Reflector
         * getAllAndOverride()
         */
        const requiredRole = this.reflector.getAllAndOverride<UserRole>(
            ROLES_KEY, 
            [
                context.getHandler(), 
                context.getClass(), 
            ],
        )

        if(!requiredRole){
            return true; 
        }

        const { user } = context.switchToHttp().getRequest() as { user?: TokenUserPayload };

        if(!user){
            throw new UnauthorizedException(
                `토큰을 제공해 주세요.`,
            );
        }

        // 요구 권한 이상이면 통과 (예: @Roles(USER)는 USER, ADMIN 허용)
        if( ROLE_LEVEL[user.role as UserRole] < ROLE_LEVEL[requiredRole] ){
            throw new ForbiddenException(
                `작업을 수행할 권한이 없습니다. ${requiredRole} 권한이 필요합니다.`
            );
        }

        const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(
            ADMIN_PERMISSION_KEY,
            [
                context.getHandler(),
                context.getClass(),
            ],
        );

        if( permission && !hasAdminPermission(user, permission) ){
            throw new ForbiddenException(
                `작업을 수행할 권한이 없습니다. 관리자 기능(${permission}) 권한이 필요합니다.`
            );
        }

        return true; 
    }
}