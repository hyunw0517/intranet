import { AddonGate } from "@/features/addon/guards/addon-gate";

// 예약 관리 (애드온 reservations) - 꺼져 있으면 일반 404
export default function AdminReservationsLayout({ children }: LayoutProps<"/admin/reservations">) {
  return <AddonGate name="reservations">{children}</AddonGate>;
}
