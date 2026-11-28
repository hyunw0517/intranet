import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/common/data-state";
import { ScheduleView } from "@/features/reservation/components/schedule-view";

export const metadata: Metadata = { title: "시설 예약" };

// 시간표 - 분류·날짜를 URL 쿼리로 읽어서 Suspense로 감싼다.
export default function ReservationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ScheduleView />
    </Suspense>
  );
}
