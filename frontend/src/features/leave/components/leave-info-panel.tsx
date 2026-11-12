"use client";

import { ErrorState, LoadingState } from "@/components/common/data-state";
import { InfoItem } from "@/components/common/section";
import { LEAVE_UNIT_LABEL } from "@/types/leave";
import { useLeaveByDocument } from "../hooks/use-leaves";
import { formatDays, formatLeavePeriod } from "../leave-rules";

// 결재 문서 상세의 휴가 정보 (휴가 문서는 본문이 없고 이 정보로 결재한다)
// 열람 권한은 결재 문서와 같다 (기안자·결재라인·관리자)
export function LeaveInfoPanel({ documentId }: { documentId: number }) {
  const { data, isPending, isError, error, refetch } = useLeaveByDocument(documentId, true);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <section aria-label="휴가 정보" className="grid gap-4 rounded-lg border p-4">
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="휴가 유형" value={data.typeLabel} />
        <InfoItem label="사용 단위" value={LEAVE_UNIT_LABEL[data.unit]} />
        <InfoItem label="기간" value={formatLeavePeriod(data)} />
        <InfoItem label="사용 일수" value={formatDays(data.days)} />
      </dl>
      {data.reason && (
        <dl>
          <InfoItem label="사유" value={<span className="whitespace-pre-wrap">{data.reason}</span>} />
        </dl>
      )}
    </section>
  );
}
