import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LeaveHistoryView } from "@/features/leave/components/leave-history-view";

export const metadata: Metadata = { title: "휴가내역" };

export default function LeavesPage() {
  return (
    <>
      <PageHeader title="휴가내역" description="내 연차 현황과 휴가 신청 이력을 확인합니다. 신청은 전자결재에서 합니다." />
      <LeaveHistoryView />
    </>
  );
}
