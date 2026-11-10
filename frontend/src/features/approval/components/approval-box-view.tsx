"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatListDate } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import {
  APPROVAL_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  type ApprovalBox,
  type ApprovalListItem,
  type ApprovalStatus,
} from "@/types/approval";
import { approvalHref } from "../approval-rules";
import { useApprovalCounts, useApprovalList } from "../hooks/use-approvals";
import { ApprovalStatusBadge, StepStatusText } from "./approval-badges";

// 결재함 구분 (features.md 7.5 결재함 표) - 처리할 일이 먼저 보이도록 결재 대기를 첫 탭으로
const BOXES: { box: ApprovalBox; label: string; empty: string; adminOnly?: boolean }[] = [
  { box: "pending", label: "결재 대기", empty: "지금 결재할 문서가 없습니다." },
  { box: "upcoming", label: "결재 예정", empty: "곧 차례가 올 문서가 없습니다." },
  { box: "mine", label: "기안함", empty: "상신한 문서가 없습니다." },
  { box: "drafts", label: "임시저장", empty: "임시저장한 문서가 없습니다." },
  { box: "processed", label: "결재 완료", empty: "결재한 문서가 없습니다." },
  { box: "all", label: "전체 문서", empty: "문서가 없습니다.", adminOnly: true },
];

// 상태 필터를 쓰는 결재함 (나머지는 상태가 정해져 있음)
const STATUS_FILTER_BOXES: ApprovalBox[] = ["mine", "processed", "all"];
const FILTER_STATUSES: ApprovalStatus[] = ["REQUESTED", "IN_PROGRESS", "APPROVED", "REJECTED", "CANCELLED"];
const ALL = "all";
const PAGE_SIZE = 20;

// 건수를 표시하는 탭 (확인할 것만 센다 - 기안함은 결재요청·결재중만, 2026-11-10 사용자 결정)
// 결재 완료·전체 문서는 계속 늘기만 하는 목록이라 표시하지 않는다.
const COUNTED_BOXES = ["pending", "upcoming", "mine", "drafts"] as const;
function isCountedBox(box: ApprovalBox): box is (typeof COUNTED_BOXES)[number] {
  return (COUNTED_BOXES as readonly string[]).includes(box);
}

// 결재함 - 결재함·상태·페이지는 URL(?box=&status=&page=)에 둔다. (상세에서 뒤로 가기·새로고침해도 유지)
export function ApprovalBoxView() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = user?.role === "ADMIN";
  const boxes = BOXES.filter((b) => !b.adminOnly || isAdmin);
  const box = (boxes.find((b) => b.box === params.get("box"))?.box ?? "pending") as ApprovalBox;
  const status = STATUS_FILTER_BOXES.includes(box) ? (params.get("status") as ApprovalStatus | null) ?? undefined : undefined;
  const page = Number(params.get("page")) || 1;

  const setParams = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const { data, isPending, isError, error, refetch } = useApprovalList({ box, status, page, take: PAGE_SIZE });
  const counts = useApprovalCounts();
  const current = boxes.find((b) => b.box === box)!;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={box} onValueChange={(v) => setParams({ box: v, status: null, page: null })} className="max-w-full overflow-x-auto">
          <TabsList>
            {boxes.map((b) => {
              const count = isCountedBox(b.box) ? counts.data?.[b.box] : undefined;
              return (
                <TabsTrigger key={b.box} value={b.box}>
                  {b.label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums" aria-label={`${count}건`}>
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {STATUS_FILTER_BOXES.includes(box) && (
          <Select value={status ?? ALL} onValueChange={(v) => setParams({ status: v === ALL ? null : v, page: null })}>
            <SelectTrigger size="sm" className="w-32" aria-label="문서 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 상태</SelectItem>
              {FILTER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {APPROVAL_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState message={current.empty} />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {data.data.map((doc) => (
              <ApprovalRow key={doc.id} doc={doc} box={box} />
            ))}
          </ul>
          <PaginationBar meta={data.meta} onPageChange={(p) => setParams({ page: String(p) })} />
        </>
      )}
    </div>
  );
}

// 목록 한 줄: 제목·상태 / 기안자·유형·결재선 진행·날짜 (좁은 화면에서는 두 줄로 내려간다)
function ApprovalRow({ doc, box }: { doc: ApprovalListItem; box: ApprovalBox }) {
  const current = doc.steps.find((s) => s.stepOrder === doc.currentStepOrder);
  const done = doc.steps.filter((s) => s.status === "APPROVED").length;
  // 날짜: 임시저장 = 최근 저장, 결재 완료 = 내가 처리한 시각, 그 외 = 상신 시각
  const date = box === "drafts" ? doc.updatedAt : box === "processed" ? doc.myStep?.actedAt ?? doc.requestedAt : doc.requestedAt;

  return (
    <li>
      <Link href={approvalHref(doc.id)} className="grid gap-1 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50">
        <span className="flex items-center gap-2">
          <ApprovalStatusBadge status={doc.status} />
          <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
          {date && (
            <time dateTime={date} title={formatDateTime(date)} className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatListDate(date)}
            </time>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{doc.requester.name}</span>
          <span>{DOCUMENT_TYPE_LABEL[doc.documentType]}</span>
          {doc.steps.length > 0 && (
            <span className="tabular-nums">
              결재 {done}/{doc.steps.length}
              {current && ` · 현재 ${current.approverName}`}
            </span>
          )}
          {box === "processed" && doc.myStep && (
            <span>
              내 결재: <StepStatusText status={doc.myStep.status} />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
