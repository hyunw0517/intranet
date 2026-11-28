import { UserRole } from "src/generated/prisma/client";

// 권한 등급 (숫자가 클수록 상위 권한)
// ADMIN의 관리자 기능은 등급이 아니라 adminPermissions로 나눈다 (@RequireAdmin)
export const ROLE_LEVEL: Record<UserRole, number> = {
    GUEST: 0,
    USER: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3,
};
