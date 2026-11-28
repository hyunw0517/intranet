import { applyDecorators, SetMetadata } from "@nestjs/common";
import { AdminPermission, UserRole } from "src/generated/prisma/client";
import { Roles } from "./roles.decorator";

export const ADMIN_PERMISSION_KEY = 'admin_permission';

//* 관리자 API 데코레이터 (ADMIN 이상 + 관리자 기능)
//  - @RequireAdmin(AdminPermission.USERS): SUPER_ADMIN, 또는 USERS 기능을 가진 ADMIN
//  - @RequireAdmin(): 기능과 상관없이 ADMIN 이상 (여러 관리자 화면이 같이 쓰는 조회용)
//  - 슈퍼관리자 전용은 @Roles(UserRole.SUPER_ADMIN)
export const RequireAdmin = ( permission?: AdminPermission ) => applyDecorators(
    Roles(UserRole.ADMIN),
    SetMetadata(ADMIN_PERMISSION_KEY, permission),
);
