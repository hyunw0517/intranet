import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ApprovalBoxView } from "@/features/approval/components/approval-box-view";
import { ApprovalNav } from "@/features/approval/components/approval-nav";

export const metadata: Metadata = { title: "전자결재" };

// 결재함 - 결재함·상태·페이지는 URL 쿼리(useSearchParams)라 Suspense로 감싼다.
export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="전자결재"
        description="결재할 문서와 내가 올린 문서를 확인합니다."
        actions={
          <Button asChild>
            <Link href="/approvals/new">
              <Plus aria-hidden />새 문서
            </Link>
          </Button>
        }
      />
      <ApprovalNav />
      <Suspense fallback={<LoadingState />}>
        <ApprovalBoxView />
      </Suspense>
    </>
  );
}
