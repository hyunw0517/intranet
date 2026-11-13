import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/common/data-state";
import { ScheduleView } from "@/features/reservation/components/schedule-view";

export const metadata: Metadata = { title: "시설 예약" };

// 시간표 - 보고 있는 분류·날짜는 URL 쿼리(useSearchParams)라 Suspense로 감싼다. (정적 렌더링 단계에서 쿼리를 모름)
export default function ReservationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ScheduleView />
    </Suspense>
  );
}
