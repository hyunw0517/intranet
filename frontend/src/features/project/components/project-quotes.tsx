"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, type ProjectDetail } from "@/types/project";
import { useQuotes } from "../hooks/use-projects";
import { QuoteStatusBadge } from "./quote-status-badge";

// 견적 탭 - 계약 금액(확정 견적 합계) + 견적 목록 (docs/design/projects.md 5-1장)
// 견적은 발주처(프로젝트의 거래처)에게 내는 문서라 발주처가 없으면 만들 수 없다(서버도 400).
export function ProjectQuotes({ project }: { project: ProjectDetail }) {
  const { data, isPending, isError, error, refetch } = useQuotes(project.id);
  const hasClient = !!project.client;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">계약 금액 (확정 견적 합계, 부가세 포함)</p>
          <p className="text-xl font-semibold tabular-nums">{data ? formatAmount(data.contractAmount) : "-"}</p>
        </div>
        {hasClient ? (
          <Button asChild>
            <Link href={`/projects/${project.id}/quotes/new`}>
              <Plus aria-hidden />새 견적
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">견적을 쓰려면 프로젝트 [수정]에서 거래처(발주처)를 먼저 지정해 주세요.</p>
        )}
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.quotes.length === 0 ? (
        <EmptyState message="작성한 견적서가 없습니다." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">견적번호</TableHead>
                <TableHead>견적명</TableHead>
                <TableHead className="w-16">버전</TableHead>
                <TableHead className="w-24">상태</TableHead>
                <TableHead className="w-28">견적일</TableHead>
                <TableHead className="w-40 text-right">합계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="tabular-nums">
                    <Link href={`/projects/${project.id}/quotes/${q.id}`} className="font-medium hover:underline">
                      {q.quoteNo}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-72 truncate">{q.title}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">v{q.latest.version}</TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={q.latest.status} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{q.latest.quoteDate.slice(0, 10)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(q.latest.totalAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
