import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdminReservationList } from "@/features/admin/components/facilities/admin-reservation-list";

export const metadata: Metadata = { title: "예약 관리" };

export default function AdminReservationsPage() {
  return (
    <>
      <PageHeader title="예약 관리" description="전체 시설 예약을 보고 시간 변경·취소·삭제합니다(체크박스로 여러 건을 한 번에 처리). 남의 예약을 바꾸면 예약자에게 알림이 갑니다." />
      <AdminReservationList />
    </>
  );
}
