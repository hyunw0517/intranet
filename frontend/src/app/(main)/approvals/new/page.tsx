import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/common/data-state";
import { ApprovalWriteView } from "@/features/approval/components/approval-write-view";

export const metadata: Metadata = { title: "새 결재 문서" };

// 문서 유형(?type=leave)은 URL 쿼리(useSearchParams)라 Suspense로 감싼다.
export default function ApprovalNewPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ApprovalWriteView />
    </Suspense>
  );
}
