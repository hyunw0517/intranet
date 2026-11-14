import { AddonGate } from "@/features/addon/guards/addon-gate";
import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 연차 관리 (휴가 옵션 leaves) - 꺼져 있으면 일반 404, LEAVES 기능을 가진 관리자만
export default function AdminLeavesLayout({ children }: LayoutProps<"/admin/leaves">) {
  return (
    <AddonGate name="leaves">
      <AdminPermissionGate permission="LEAVES">{children}</AdminPermissionGate>
    </AddonGate>
  );
}
