import { AddonGate } from "@/features/addon/guards/addon-gate";

// 연차 관리 (휴가 옵션 leaves) - 꺼져 있으면 일반 404
export default function AdminLeavesLayout({ children }: LayoutProps<"/admin/leaves">) {
  return <AddonGate name="leaves">{children}</AddonGate>;
}
