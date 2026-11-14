import { AddonGate } from "@/features/addon/guards/addon-gate";
import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 결재라인 관리자 (애드온 approvals) - 꺼져 있으면 일반 404, APPROVAL_LINES 기능을 가진 관리자만
export default function AdminApprovalManagersLayout({ children }: LayoutProps<"/admin/approval-managers">) {
  return (
    <AddonGate name="approvals">
      <AdminPermissionGate permission="APPROVAL_LINES">{children}</AdminPermissionGate>
    </AddonGate>
  );
}
