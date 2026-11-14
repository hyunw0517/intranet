import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 조직 관리 - ORGANIZATION 기능을 가진 관리자만 (최종 검증은 백엔드 @RequireAdmin)
export default function AdminOrganizationLayout({ children }: LayoutProps<"/admin/organization">) {
  return <AdminPermissionGate permission="ORGANIZATION">{children}</AdminPermissionGate>;
}
