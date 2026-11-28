"use client";

import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { cancelSale, deleteSale } from "@/services/api/project-sales";
import { formatAmount, PAYMENT_STATUS_LABEL, SALE_STATUS_LABEL, type ProjectSale } from "@/types/project";
import { useProjectMutation, useSales } from "../hooks/use-projects";
import { MonthlyAmountChart } from "./charts-lazy";
import { SaleDetailDialog } from "./sale-detail-dialog";
import { SaleFormDialog, type SaleFormState } from "./sale-form-dialog";

type Pending = { kind: "cancel" | "delete"; sale: ProjectSale } | null;

// 매출 탭 - 요약, 확정 견적별 청구 잔액, 청구 건 목록
// 매출 기준일은 청구일. 청구 예정은 "예상 매출"로 따로 센다. 취소된 청구는 합계에서 빠진다.
export function ProjectSales({ projectId }: { projectId: number }) {
  const { data, isPending, isError, error, refetch } = useSales(projectId);
  const [form, setForm] = useState<SaleFormState>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const action = useProjectMutation(({ kind, id }: { kind: "cancel" | "delete"; id: number }) =>
    kind === "cancel" ? cancelSale(projectId, id) : deleteSale(projectId, id),
  );

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  // 상세 창은 최신 목록의 같은 건을 보여 준다 (수금·청구 후 바로 반영)
  const detail = data.sales.find((s) => s.id === detailId) ?? null;

  const run = async () => {
    if (!pending) return;
    try {
      await action.mutateAsync({ kind: pending.kind, id: pending.sale.id });
      toast.success(pending.kind === "cancel" ? "청구를 취소했습니다." : "청구 예정을 삭제했습니다.");
      setPending(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const cards: [string, string, string][] = [
    ["청구 매출", data.summary.billedTotal, "청구일 기준 (부가세 포함)"],
    ["예상 매출", data.summary.plannedTotal, "청구 예정"],
    ["수금", data.summary.paidTotal, "청구한 건의 수금 합계"],
    ["미수금", data.summary.outstanding, "청구 매출 - 수금"],
  ];

  return (
    <div className="grid gap-5">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <li key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{formatAmount(value)}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </li>
        ))}
      </ul>

      <section className="grid gap-2 rounded-lg border p-4">
        <h3 className="text-sm font-medium">월별 매출 (최근 12개월, 청구일 기준, 부가세 포함)</h3>
        <MonthlyAmountChart data={data.monthlySales} label="매출" emptyMessage="최근 12개월 동안 청구한 매출이 없습니다." />
      </section>

      {data.confirmedQuotes.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">확정 견적별 청구 잔액</h3>
          <ul className="grid gap-1 text-sm">
            {data.confirmedQuotes.map((q) => (
              <li key={q.id} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 tabular-nums">
                <span>
                  {q.quote.quoteNo} v{q.version} · {q.quote.title}
                </span>
                <span className="text-muted-foreground">
                  견적 {formatAmount(q.totalAmount)} · 청구 {formatAmount(q.billedAmount)} · <span className="font-medium text-foreground">잔액 {formatAmount(q.remaining)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">청구 건 {data.sales.length}</h3>
        <Button onClick={() => setForm({ mode: "create" })}>
          <Plus aria-hidden />
          매출 등록
        </Button>
      </div>

      {data.sales.length === 0 ? (
        <EmptyState message="등록한 매출이 없습니다. 계약금·잔금처럼 나눠 청구할 수 있습니다." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>청구명</TableHead>
                <TableHead className="w-36">견적</TableHead>
                <TableHead className="w-24">상태</TableHead>
                <TableHead className="w-28">청구일</TableHead>
                <TableHead className="w-36 text-right">합계</TableHead>
                <TableHead className="w-28">수금</TableHead>
                <TableHead className="w-12"><span className="sr-only">관리</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sales.map((s) => (
                <TableRow key={s.id} className={cn(s.status === "CANCELLED" && "text-muted-foreground")}>
                  <TableCell>
                    <button type="button" className="font-medium hover:underline" onClick={() => setDetailId(s.id)}>
                      {s.title}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{s.quoteVersion ? `${s.quoteVersion.quote.quoteNo} v${s.quoteVersion.version}` : "-"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "BILLED" ? "default" : s.status === "CANCELLED" ? "outline" : "secondary"}>{SALE_STATUS_LABEL[s.status]}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {s.billedDate?.slice(0, 10) ?? (s.plannedDate ? `${s.plannedDate.slice(0, 10)} 예정` : "-")}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", s.status === "CANCELLED" && "line-through")}>{formatAmount(s.totalAmount)}</TableCell>
                  <TableCell className="text-sm">{s.status === "BILLED" ? PAYMENT_STATUS_LABEL[s.paymentStatus] : "-"}</TableCell>
                  <TableCell>
                    {s.status !== "CANCELLED" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${s.title} 관리`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setDetailId(s.id)}>{s.status === "PLANNED" ? "청구하기" : "수금 기록"}</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setForm({ mode: "edit", sale: s })}>수정</DropdownMenuItem>
                          {s.status === "PLANNED" ? (
                            <DropdownMenuItem className="text-destructive" onSelect={() => setPending({ kind: "delete", sale: s })}>
                              삭제
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem className="text-destructive" onSelect={() => setPending({ kind: "cancel", sale: s })}>
                              청구 취소
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SaleFormDialog projectId={projectId} quotes={data.confirmedQuotes} state={form} onClose={() => setForm(null)} />
      <SaleDetailDialog projectId={projectId} sale={detail} onClose={() => setDetailId(null)} />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === "cancel" ? "청구를 취소할까요?" : "청구 예정을 삭제할까요?"}
        description={
          pending?.kind === "cancel"
            ? "'취소'로 남고 매출·청구 합계에서 빠집니다. 수금 기록이 있으면 취소할 수 없습니다(수금을 먼저 지워 주세요)."
            : "청구 예정 건을 지웁니다."
        }
        confirmLabel={pending?.kind === "cancel" ? "청구 취소" : "삭제"}
        destructive
        pending={action.isPending}
        onConfirm={run}
      />
    </div>
  );
}
