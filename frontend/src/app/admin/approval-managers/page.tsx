import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { LineManagerView } from "@/features/admin/components/approvals/line-manager-view";

export const metadata: Metadata = { title: "결재라인 관리자" };

export default function AdminApprovalManagersPage() {
  return (
    <>
      <PageHeader
        title="결재라인 관리자"
        description="공용·부서 결재라인을 관리할 수 있는 사람을 지정합니다. 결재라인은 전자결재 › 결재라인 화면에서 관리합니다."
      />
      <LineManagerView />
    </>
  );
}
