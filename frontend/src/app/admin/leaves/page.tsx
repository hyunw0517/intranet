import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LeaveGrantView } from "@/features/admin/components/leaves/leave-grant-view";

export const metadata: Metadata = { title: "연차 관리" };

export default function AdminLeavesPage() {
  return (
    <>
      <PageHeader
        title="연차 관리"
        description="회원별 연차 부여·사용 현황을 보고 조정합니다. 계산값은 매월 1일 00시에 다시 계산되며 조정값은 유지됩니다."
      />
      <LeaveGrantView />
    </>
  );
}
