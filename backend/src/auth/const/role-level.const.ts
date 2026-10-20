import { UserRole } from "src/generated/prisma/client";

// 권한 등급 (숫자가 클수록 상위 권한)
export const ROLE_LEVEL: Record<UserRole, number> = {
    GUEST: 0,
    USER: 1,
    ADMIN: 2,
};
