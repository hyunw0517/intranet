import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ApprovalLinesView } from "@/features/approval/components/approval-lines-view";
import { ApprovalNav } from "@/features/approval/components/approval-nav";

export const metadata: Metadata = { title: "결재라인" };

export default function ApprovalLinesPage() {
  return (
    <>
      <PageHeader title="전자결재" description="결재 문서 작성 때 불러올 결재라인을 관리합니다." />
      <ApprovalNav />
      <ApprovalLinesView />
    </>
  );
}
