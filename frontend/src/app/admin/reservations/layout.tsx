import { AddonGate } from "@/features/addon/guards/addon-gate";
import { AdminPermissionGate } from "@/features/auth/guards/role-gate";

// 예약 관리 (애드온 reservations) - 꺼져 있으면 일반 404, RESERVATIONS 기능을 가진 관리자만
export default function AdminReservationsLayout({ children }: LayoutProps<"/admin/reservations">) {
  return (
    <AddonGate name="reservations">
      <AdminPermissionGate permission="RESERVATIONS">{children}</AdminPermissionGate>
    </AddonGate>
  );
}
