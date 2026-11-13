import { AddonGate } from "@/features/addon/guards/addon-gate";

// 전자결재 (애드온 approvals) - 꺼져 있으면 일반 404 (AddonGate)
// 제목은 페이지마다 다르므로(결재함·작성·상세) 각 페이지에서 그린다.
export default function ApprovalsLayout({ children }: LayoutProps<"/approvals">) {
  return <AddonGate name="approvals">{children}</AddonGate>;
}
