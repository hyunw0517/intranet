import { PageHeader } from "@/components/layout/page-header";
import { AddonGate } from "@/features/addon/guards/addon-gate";
import { ReservationNav } from "@/features/reservation/components/reservation-nav";

// 시설 예약 (애드온 reservations) - 꺼져 있으면 일반 404 (AddonGate)
export default function ReservationsLayout({ children }: LayoutProps<"/reservations">) {
  return (
    <AddonGate name="reservations">
      <PageHeader title="시설 예약" description="회의실·차량 등 회사 시설의 예약 현황을 보고 예약합니다." />
      <ReservationNav />
      {children}
    </AddonGate>
  );
}
