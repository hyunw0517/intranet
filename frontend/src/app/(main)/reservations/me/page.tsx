import type { Metadata } from "next";
import { MyReservationsView } from "@/features/reservation/components/my-reservations-view";

export const metadata: Metadata = { title: "내 예약" };

// 내 예약 (알림을 누르면 이동하는 주소)
export default function MyReservationsPage() {
  return <MyReservationsView />;
}
