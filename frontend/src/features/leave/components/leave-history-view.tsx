"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApprovalStatusBadge } from "@/features/approval/components/approval-badges";
import { approvalHref } from "@/features/approval/approval-rules";
import { cn } from "@/lib/utils";
import { LEAVE_UNIT_LABEL, type LeaveSummary } from "@/types/leave";
import { useMyLeaves, useMyLeaveSummary } from "../hooks/use-leaves";
import { formatDays, formatLeavePeriod, thisYearKst } from "../leave-rules";

// [휴가내역] (마이페이지 아래, 2026-11-12 사용자 결정)
// - 위: 그 연도 전체 휴가(= 연차 부여: 계산값 + 조정값) · 사용 · 결재 중 · 남은 연차
// - 아래: 그 연도 신청 이력 - 병가·공가 포함(유형 표시), 임시저장·반려·회수도 상태 배지로. 누르면 결재 문서로
// - 신청은 전자결재 작성 화면(문서 유형 "휴가 신청")에서 한다.
export function LeaveHistoryView() {
  const [year, setYear] = useState(thisYearKst);
  const summary = useMyLeaveSummary(year);
  const list = useMyLeaves(year);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="이전 연도" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-20 text-center text-lg font-semibold tabular-nums" aria-live="polite">
            {year}년
          </h2>
          <Button variant="outline" size="icon-sm" aria-label="다음 연도" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button asChild>
          <Link href="/approvals/new?type=leave">
            <Plus aria-hidden />
            휴가 신청
          </Link>
        </Button>
      </div>

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <SummaryCards summary={summary.data} />
      )}

      <section className="grid gap-3" aria-labelledby="leave-history-title">
        <h2 id="leave-history-title" className="text-base font-semibold">
          신청 이력
        </h2>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState message={`${year}년 휴가 신청이 없습니다.`} />
        ) : (
          <div className={cn("overflow-x-auto rounded-lg border", list.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">상태</TableHead>
                  <TableHead className="w-16">유형</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="w-20">단위</TableHead>
                  <TableHead className="w-20 text-right">일수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.map((leave) => (
                  <TableRow key={leave.id} className="relative">
                    <TableCell>
                      <ApprovalStatusBadge status={leave.documentStatus} />
                    </TableCell>
                    <TableCell>{leave.typeLabel}</TableCell>
                    <TableCell className="tabular-nums">
                      {/* 행 전체를 누르면 결재 문서로 (링크는 기간 칸에 두고 행 전체로 넓힌다) */}
                      <Link
                        href={approvalHref(leave.documentId)}
                        className="after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {formatLeavePeriod(leave)}
                      </Link>
                    </TableCell>
                    <TableCell>{LEAVE_UNIT_LABEL[leave.unit]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDays(leave.days)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          연차만 남은 연차에서 차감됩니다. 병가·공가는 결재만 거칩니다. 임시저장·반려·회수된 신청은 차감되지 않습니다.
        </p>
      </section>
    </div>
  );
}

// 전체 휴가 아래 작은 글씨: 관리자 조정 내역 (영구·올해, 0이면 생략)
function adjustHint(s: LeaveSummary) {
  const sign = (d: number) => `${d > 0 ? "+" : ""}${formatDays(d)}`;
  const parts = [s.permanentDays !== 0 && `영구 조정 ${sign(s.permanentDays)}`, s.adjustDays !== 0 && `올해 조정 ${sign(s.adjustDays)}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

// 연차 요약 (부여 행이 없으면 0으로 보이고 안내를 붙인다)
function SummaryCards({ summary }: { summary: LeaveSummary }) {
  const items = [
    { label: "전체 휴가", value: summary.grantedDays, hint: adjustHint(summary) },
    { label: "사용", value: summary.usedDays },
    { label: "결재 중", value: summary.inProgressDays },
    { label: "남은 연차", value: summary.remainingDays, strong: true },
  ];

  return (
    <div className="grid gap-2">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="grid gap-1 rounded-lg border p-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={cn("text-xl tabular-nums", item.strong ? "font-semibold" : "font-medium", item.value < 0 && "text-destructive")}>
              {formatDays(item.value)}
            </dd>
            {item.hint && <dd className="text-xs text-muted-foreground">{item.hint}</dd>}
          </div>
        ))}
      </dl>
      {!summary.hasGrant && (
        <p className="text-xs text-muted-foreground">{summary.year}년 연차가 아직 부여되지 않았습니다. 필요하면 관리자에게 문의하세요.</p>
      )}
    </div>
  );
}
