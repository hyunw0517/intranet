import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 감사 로그 - AUDIT 기능을 가진 관리자만
export default function AdminAuditLayout({ children }: LayoutProps<"/admin/audit">) {
  return <AdminPermissionGate permission="AUDIT">{children}</AdminPermissionGate>;
}
