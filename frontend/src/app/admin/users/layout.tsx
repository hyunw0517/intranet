import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 회원 관리 - USERS 기능을 가진 관리자만 (최종 검증은 백엔드 @RequireAdmin)
export default function AdminUsersLayout({ children }: LayoutProps<"/admin/users">) {
  return <AdminPermissionGate permission="USERS">{children}</AdminPermissionGate>;
}
