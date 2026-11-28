"use client";

import { useState } from "react";
import { FileText, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FileDownloadConfirmDialog } from "@/components/common/file-download-confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { deleteExpense, downloadExpenseFile } from "@/services/api/project-budgets";
import type { FileInfo } from "@/types/file";
import { formatAmount, formatTax, type ProjectExpense } from "@/types/project";
import { useProjectBudget, useProjectMutation } from "../hooks/use-projects";
import { BudgetEditDialog } from "./budget-edit-dialog";
import { BudgetCompareChart, MonthlyAmountChart } from "./charts-lazy";
import { ExpenseFormDialog, type ExpenseFormState } from "./expense-form-dialog";

// 음수(초과)도 자릿수를 끊어 보여 준다
const signedAmount = (value: string) => (value.startsWith("-") ? `-${formatAmount(value.slice(1))}` : formatAmount(value));

// 예산 탭 - 요약, 항목별 예산 대비 지출, 월별 지출, 협력사별 지급, 지출 목록
// 예산을 넘은 항목은 빨간색으로 표시할 뿐 저장을 막지 않는다.
export function ProjectBudget({ projectId }: { projectId: number }) {
  const { data, isPending, isError, error, refetch } = useProjectBudget(projectId);
  const [editingBudget, setEditingBudget] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(null);
  const [removing, setRemoving] = useState<ProjectExpense | null>(null);
  const [download, setDownload] = useState<{ expenseId: number; file: FileInfo } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const remove = useProjectMutation((id: number) => deleteExpense(projectId, id));

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const runRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success("지출을 삭제했습니다.");
      setRemoving(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const runDownload = async () => {
    if (!download) return;
    setDownloading(true);
    try {
      const blob = await downloadExpenseFile(projectId, download.expenseId, download.file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = download.file.originalName;
      a.click();
      URL.revokeObjectURL(url);
      setDownload(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const overBudget = data.summary.remaining.startsWith("-");
  const cards: [string, string, string, boolean][] = [
    ["예산", formatAmount(data.summary.budgetTotal), "항목별 예산 합계", false],
    ["지출", formatAmount(data.summary.spentTotal), "공급가액 기준", false],
    ["남은 예산", signedAmount(data.summary.remaining), overBudget ? "예산을 넘었습니다" : "예산 - 지출", overBudget],
  ];

  return (
    <div className="grid gap-6">
      <ul className="grid gap-3 sm:grid-cols-3">
        {cards.map(([label, value, hint, danger]) => (
          <li key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("text-lg font-semibold tabular-nums", danger && "text-destructive")}>{value}</p>
            <p className={cn("text-xs text-muted-foreground", danger && "text-destructive")}>{hint}</p>
          </li>
        ))}
      </ul>
      <p className="-mt-3 text-xs text-muted-foreground">예산·지출·남은 금액은 모두 공급가액(부가세 별도) 기준입니다.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid content-start gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-medium">항목별 예산 대비 지출</h3>
          <BudgetCompareChart data={data.categories} />
        </section>
        <section className="grid content-start gap-2 rounded-lg border p-4">
          <h3 className="text-sm font-medium">월별 지출 (최근 12개월)</h3>
          <MonthlyAmountChart data={data.monthlyExpenses} label="지출" emptyMessage="최근 12개월 동안 기록한 지출이 없습니다." />
        </section>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">항목별 예산 (공급가액 기준)</h3>
          <Button variant="outline" onClick={() => setEditingBudget(true)}>
            <Pencil aria-hidden />
            예산 편성
          </Button>
        </div>
        {data.categories.length === 0 ? (
          <EmptyState message="편성한 예산이 없습니다." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>비용 항목</TableHead>
                  <TableHead className="w-36 text-right">예산</TableHead>
                  <TableHead className="w-36 text-right">지출</TableHead>
                  <TableHead className="w-36 text-right">남은 예산</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.categories.map((c) => (
                  <TableRow key={c.categoryId}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.deleted && <span className="ml-1 text-xs font-normal text-muted-foreground">(숨긴 항목)</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(c.budgetAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(c.spentAmount)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", c.over && "font-medium text-destructive")}>{signedAmount(c.remaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>합계</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(data.summary.budgetTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(data.summary.spentTotal)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", overBudget && "text-destructive")}>{signedAmount(data.summary.remaining)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      {data.partners.length > 0 && (
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">협력사별 지급 (공급가액 기준)</h3>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>협력사</TableHead>
                  <TableHead className="w-36 text-right">계약 금액</TableHead>
                  <TableHead className="w-36 text-right">지급액</TableHead>
                  <TableHead className="w-36 text-right">남은 금액</TableHead>
                  <TableHead className="w-44 text-right">실제 지급액(부가세 포함)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.partners.map((p) => (
                  <TableRow key={p.partnerId}>
                    <TableCell className="font-medium">
                      {p.name}
                      {p.removed && <span className="ml-1 text-xs font-normal text-muted-foreground">(빠진 협력사)</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(p.contractAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(p.paidAmount)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", p.remaining?.startsWith("-") && "font-medium text-destructive")}>
                      {p.remaining === null ? "-" : signedAmount(p.remaining)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(p.paidTotalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">지출 {data.expenses.length}</h3>
          <Button onClick={() => setForm({ mode: "create" })}>
            <Plus aria-hidden />
            지출 기록
          </Button>
        </div>
        {data.expenses.length === 0 ? (
          <EmptyState message="기록한 지출이 없습니다." />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">지출일</TableHead>
                  <TableHead className="w-28">항목</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-32">협력사</TableHead>
                  <TableHead className="w-36 text-right">공급가액</TableHead>
                  <TableHead className="w-40 text-right">합계</TableHead>
                  <TableHead className="w-12"><span className="sr-only">관리</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{e.expenseDate.slice(0, 10)}</TableCell>
                    <TableCell>{e.category.name}</TableCell>
                    <TableCell>
                      <span className="font-medium">{e.title}</span>
                      {e.memo && <span className="block max-w-72 truncate text-xs text-muted-foreground" title={e.memo}>{e.memo}</span>}
                      {e.files.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {e.files.map((f) => (
                            <button key={f.id} type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => setDownload({ expenseId: e.id, file: f })}>
                              <FileText className="size-3" aria-hidden />
                              {f.originalName}
                            </button>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.partner?.client.name ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(e.supplyAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(e.totalAmount)}
                      <span className="block text-xs text-muted-foreground">{formatTax(e.taxType, e.vatRate)}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${e.title} 관리`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setForm({ mode: "edit", expense: e })}>수정</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onSelect={() => setRemoving(e)}>
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <BudgetEditDialog projectId={projectId} current={data.categories} open={editingBudget} onClose={() => setEditingBudget(false)} />
      <ExpenseFormDialog projectId={projectId} categories={data.categories} partners={data.partners} state={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="지출을 삭제할까요?"
        description={`${removing?.title ?? ""} 지출이 예산 합계에서 빠집니다.`}
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
      />
      <FileDownloadConfirmDialog fileName={download?.file.originalName ?? ""} open={download !== null} onOpenChange={(open) => !open && setDownload(null)} pending={downloading} onConfirm={runDownload} />
    </div>
  );
}
