import { AddonGate } from "@/features/addon/guards/addon-gate";
import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 시설 관리 (애드온 reservations) - 꺼져 있으면 일반 404, FACILITIES 기능을 가진 관리자만
export default function AdminFacilitiesLayout({ children }: LayoutProps<"/admin/facilities">) {
  return (
    <AddonGate name="reservations">
      <AdminPermissionGate permission="FACILITIES">{children}</AdminPermissionGate>
    </AddonGate>
  );
}
