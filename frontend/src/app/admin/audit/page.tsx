import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AuditLogView } from "@/features/admin/components/audit/audit-log-view";

export const metadata: Metadata = { title: "감사 로그" };

export default function AdminAuditPage() {
  return (
    <>
      <PageHeader title="감사 로그" description="회원과 관리자의 주요 작업 기록을 조회합니다. 꺼진 애드온의 기록은 표시되지 않습니다." />
      <AuditLogView />
    </>
  );
}
