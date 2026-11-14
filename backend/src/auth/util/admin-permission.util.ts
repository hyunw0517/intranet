import { AdminPermission, UserRole } from "src/generated/prisma/client";

//* 관리자 기능 권한 판단 (컨트롤러 가드·서비스 분기·알림 받는 사람 공용)
//  - SUPER_ADMIN: 모든 기능
//  - ADMIN: Users.adminPermissions에 있는 기능만 (access token의 perms 또는 DB 값)
//  - 그 외: 없음
export type AdminPermissionUser = {
    role: UserRole;
    adminPermissions?: AdminPermission[] | null;
};

//* 관리자 화면에 들어갈 수 있는 권한인지 (ADMIN·SUPER_ADMIN)
export function isAdminRole( role: UserRole ): boolean {
    return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

export function hasAdminPermission( user: AdminPermissionUser, permission: AdminPermission ): boolean {
    if ( user.role === UserRole.SUPER_ADMIN ) {
        return true;
    }

    return user.role === UserRole.ADMIN && ( user.adminPermissions ?? [] ).includes( permission );
}

//* 이 기능 권한을 가진 회원을 찾는 Prisma where 조건 (알림 받는 사람 조회 등)
export function adminPermissionWhere( permission: AdminPermission ) {
    return {
        OR: [
            { role: UserRole.SUPER_ADMIN },
            { role: UserRole.ADMIN, adminPermissions: { has: permission } },
        ],
    };
}
