import { AddonGate } from "@/features/addon/guards/addon-gate";

// 휴가내역 (휴가 옵션 leaves) - 꺼져 있으면 일반 404 (AddonGate)
export default function LeavesLayout({ children }: LayoutProps<"/leaves">) {
  return <AddonGate name="leaves">{children}</AddonGate>;
}
