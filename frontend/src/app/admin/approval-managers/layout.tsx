import { AddonGate } from "@/features/addon/guards/addon-gate";

// 결재라인 관리자 (애드온 approvals) - 꺼져 있으면 일반 404
export default function AdminApprovalManagersLayout({ children }: LayoutProps<"/admin/approval-managers">) {
  return <AddonGate name="approvals">{children}</AddonGate>;
}
