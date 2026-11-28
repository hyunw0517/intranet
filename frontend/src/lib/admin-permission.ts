// 관리자 기능 권한 판단 (백엔드 admin-permission.util.ts와 같은 규칙)
// 화면 노출만 정하고 최종 검증은 서버가 한다.
import type { AdminPermission, UserRole } from "@/types/user";

export interface AdminPermissionUser {
  role: UserRole;
  adminPermissions?: AdminPermission[];
}

// 관리자 화면(/admin)에 들어갈 수 있는 권한 (ADMIN·SUPER_ADMIN)
export function isAdminRole(role: UserRole | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// SUPER_ADMIN은 모든 기능, ADMIN은 지정된 기능만
export function hasAdminPermission(user: AdminPermissionUser | null | undefined, permission: AdminPermission): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  return user.role === "ADMIN" && (user.adminPermissions ?? []).includes(permission);
}
