"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import { saveProjectBudgets } from "@/services/api/project-budgets";
import { formatAmount, type BudgetCategorySummary } from "@/types/project";
import { useBudgetCategories, useProjectMutation } from "../hooks/use-projects";

const digits = (value: string) => value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);

// 항목별 예산 입력 (참여자 누구나, docs/design/projects.md 5-3장)
// - 비워 둔 항목은 예산이 없는 것으로 저장한다(목록 전체 교체). 지출 기록은 지워지지 않는다.
// - 관리자가 숨긴 항목도 이미 예산이 있으면 금액을 고칠 수 있게 함께 보여 준다.
export function BudgetEditDialog({
  projectId,
  current,
  open,
  onClose,
}: {
  projectId: number;
  current: BudgetCategorySummary[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">{open && <BudgetForm projectId={projectId} current={current} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function BudgetForm({ projectId, current, onClose }: { projectId: number; current: BudgetCategorySummary[]; onClose: () => void }) {
  const categories = useBudgetCategories();
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(current.filter((c) => BigInt(c.budgetAmount) > BigInt(0)).map((c) => [c.categoryId, c.budgetAmount])),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const save = useProjectMutation((items: { categoryId: number; amount: number }[]) => saveProjectBudgets(projectId, items));

  // 활성 항목 + 예산이 있는 숨긴 항목
  const hidden = current.filter((c) => c.deleted && BigInt(c.budgetAmount) > BigInt(0)).map((c) => ({ id: c.categoryId, name: `${c.name} (숨긴 항목)` }));
  const rows = [...(categories.data ?? []), ...hidden];
  const total = rows.reduce((sum, r) => sum + BigInt(amounts[r.id] || "0"), BigInt(0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 저장은 목록 전체 교체라, 항목을 불러오지 못한 채 저장하면 화면에 없던 예산이 지워진다
    if (save.isPending || !categories.data) return;
    setServerError(null);
    try {
      await save.mutateAsync(rows.filter((r) => amounts[r.id]).map((r) => ({ categoryId: r.id, amount: Number(amounts[r.id]) })));
      toast.success("예산을 저장했습니다.");
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>예산 편성</DialogTitle>
        <DialogDescription>비용 항목별 예산을 공급가액(부가세 별도) 기준으로 입력합니다.</DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      {categories.isPending ? (
        <LoadingState />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message="비용 항목이 없습니다. 과제 관리 관리자에게 항목 추가를 요청해 주세요." />
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_11rem] items-center gap-3">
              <label htmlFor={`budget-${r.id}`} className="truncate text-sm">
                {r.name}
              </label>
              <Input
                id={`budget-${r.id}`}
                inputMode="numeric"
                className="text-right tabular-nums"
                value={amounts[r.id] ? Number(amounts[r.id]).toLocaleString("ko-KR") : ""}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [r.id]: digits(e.target.value) }))}
                placeholder="0"
              />
            </li>
          ))}
        </ul>
      )}

      <p className="flex justify-between border-t pt-3 text-sm font-medium tabular-nums">
        <span>합계</span>
        <span>{formatAmount(total.toString())}</span>
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          취소
        </Button>
        <Button type="submit" disabled={save.isPending || !categories.data || rows.length === 0}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          저장
        </Button>
      </DialogFooter>
    </form>
  );
}
