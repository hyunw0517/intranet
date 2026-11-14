import { applyDecorators, SetMetadata } from "@nestjs/common";
import { AdminPermission, UserRole } from "src/generated/prisma/client";
import { Roles } from "./roles.decorator";

export const ADMIN_PERMISSION_KEY = 'admin_permission';

//* 관리자 API 데코레이터 - ADMIN 이상 + 관리자 기능 권한
//  - @RequireAdmin(AdminPermission.USERS): SUPER_ADMIN, 또는 USERS 기능을 가진 ADMIN
//  - @RequireAdmin(): ADMIN 이상이면 기능과 상관없이 통과
//    (여러 관리자 화면이 같이 쓰는 조회 - 예: 부서·직급·직책 목록은 회원·게시판 권한·결재라인 화면에서도 쓴다)
//  - 판단은 RolesGuard가 한다. (등급 확인 → 기능 확인)
//  - 슈퍼관리자 전용 API는 @Roles(UserRole.SUPER_ADMIN)
export const RequireAdmin = ( permission?: AdminPermission ) => applyDecorators(
    Roles(UserRole.ADMIN),
    SetMetadata(ADMIN_PERMISSION_KEY, permission),
);
