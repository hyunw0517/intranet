"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentField } from "@/features/board/components/attachment-field";
import { getErrorMessage } from "@/lib/error-message";
import { createExpense, updateExpense, type ExpenseInput } from "@/services/api/project-budgets";
import type { FileInfo } from "@/types/file";
import { formatAmount, type BudgetCategorySummary, type BudgetPartnerSummary, type ProjectExpense, type QuoteTaxType } from "@/types/project";
import { useBudgetCategories, useProjectMutation } from "../hooks/use-projects";
import { DEFAULT_VAT_RATE, quoteTotals, vatRateError } from "../quote-calc";
import { TaxFields } from "./tax-fields";

const NO_PARTNER = "none";
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const digits = (value: string) => value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);

export type ExpenseFormState = { mode: "create" } | { mode: "edit"; expense: ProjectExpense } | null;

// 지출 기록·수정 (참여자 누구나)
// - 부가세·합계는 미리보기이고 서버가 다시 계산한다. 예산과는 공급가액으로 비교한다.
// - 예산을 넘어도 저장할 수 있고, 입력 중과 저장 뒤에 알려 준다.
export function ExpenseFormDialog({
  projectId,
  categories,
  partners,
  state,
  onClose,
}: {
  projectId: number;
  categories: BudgetCategorySummary[];
  partners: BudgetPartnerSummary[];
  state: ExpenseFormState;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {state && <ExpenseForm projectId={projectId} summaries={categories} partners={partners} state={state} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  projectId,
  summaries,
  partners,
  state,
  onClose,
  onBusyChange,
}: {
  projectId: number;
  summaries: BudgetCategorySummary[];
  partners: BudgetPartnerSummary[];
  state: NonNullable<ExpenseFormState>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const editing = state.mode === "edit" ? state.expense : null;
  const categories = useBudgetCategories();

  const [categoryId, setCategoryId] = useState(editing ? String(editing.categoryId) : "");
  const [partnerId, setPartnerId] = useState(editing?.partnerId ? String(editing.partnerId) : NO_PARTNER);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [expenseDate, setExpenseDate] = useState(editing?.expenseDate.slice(0, 10) ?? kstToday());
  const [supply, setSupply] = useState(editing?.supplyAmount ?? "");
  const [taxType, setTaxType] = useState<QuoteTaxType>(editing?.taxType ?? "TAXABLE");
  const [vatRate, setVatRate] = useState(editing?.vatRate ?? DEFAULT_VAT_RATE);
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [files, setFiles] = useState<FileInfo[]>(editing?.files ?? []);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ category?: string; title?: string; supply?: string; vatRate?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const create = useProjectMutation((input: ExpenseInput & { categoryId: number; title: string; expenseDate: string; supplyAmount: number }) => createExpense(projectId, input));
  const update = useProjectMutation((input: ExpenseInput) => updateExpense(projectId, editing!.id, input));
  const pending = create.isPending || update.isPending;

  const totals = quoteTotals([{ quantity: "1", unitPrice: supply || "0" }], taxType, vatRate);
  const rateError = vatRateError(vatRate); // 면세면 검사하지 않고 보내지도 않는다

  // 선택지: 활성 항목·협력사 + 수정 중인 지출이 이미 쓰고 있는 숨긴 항목·빠진 협력사
  const categoryOptions = [...(categories.data ?? [])];
  if (editing && !categoryOptions.some((c) => c.id === editing.categoryId)) categoryOptions.push({ id: editing.categoryId, name: `${editing.category.name} (숨긴 항목)` });
  const partnerOptions = partners.filter((p) => !p.removed || p.partnerId === editing?.partnerId);

  // 입력 중 예산 초과 경고 (수정 중이면 이 건의 기존 금액을 빼고 계산)
  const summary = summaries.find((c) => String(c.categoryId) === categoryId);
  const budget = BigInt(summary?.budgetAmount ?? "0");
  const spentOthers = BigInt(summary?.spentAmount ?? "0") - (editing && String(editing.categoryId) === categoryId ? BigInt(editing.supplyAmount) : BigInt(0));
  const over = categoryId && supply ? spentOthers + BigInt(supply) - budget : BigInt(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || uploading) return;
    const next: typeof errors = {};
    if (!categoryId) next.category = "비용 항목을 골라 주세요.";
    if (!title.trim()) next.title = "지출 내용을 입력해 주세요.";
    if (!supply || Number(supply) < 1) next.supply = "공급가액을 입력해 주세요.";
    else if (totals.overflow) next.supply = "금액이 너무 큽니다.";
    if (taxType === "TAXABLE" && rateError) next.vatRate = rateError;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    onBusyChange(true);
    const input = {
      categoryId: Number(categoryId),
      partnerId: partnerId === NO_PARTNER ? null : Number(partnerId),
      title: title.trim(),
      expenseDate,
      taxType,
      vatRate: rateError ? undefined : Number(vatRate),
      supplyAmount: Number(supply),
      memo: memo.trim() || null,
      attachmentIds: files.map((f) => f.id),
    };
    try {
      const saved = editing ? await update.mutateAsync(input) : await create.mutateAsync(input);
      if (saved.budgetWarning) toast.warning(`저장했습니다. 이 항목의 예산을 ${formatAmount(saved.budgetWarning.overAmount)} 넘었습니다.`);
      else toast.success(editing ? "지출을 저장했습니다." : "지출을 기록했습니다.");
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "지출 수정" : "지출 기록"}</DialogTitle>
        <DialogDescription>공급가액을 입력하면 부가세와 합계는 자동으로 계산됩니다. 예산과는 공급가액으로 비교합니다.</DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="expense-category" label="비용 항목" required error={errors.category ?? (categories.isError ? "비용 항목을 불러오지 못했습니다." : undefined)}>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="expense-category" className="w-full" aria-invalid={!!errors.category} aria-describedby="expense-category-message">
              <SelectValue placeholder={categories.isPending ? "불러오는 중" : "항목 선택"} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="expense-date" label="지출일" required>
          <Input id="expense-date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value || kstToday())} />
        </FormField>
      </div>

      <FormField id="expense-title" label="지출 내용" required error={errors.title}>
        <Input id="expense-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-invalid={!!errors.title} aria-describedby="expense-title-message" />
      </FormField>

      <FormField id="expense-partner" label="지급한 협력사 (선택)">
        <Select value={partnerId} onValueChange={setPartnerId}>
          <SelectTrigger id="expense-partner" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PARTNER}>협력사 아님</SelectItem>
            {partnerOptions.map((p) => (
              <SelectItem key={p.partnerId} value={String(p.partnerId)}>
                {p.name}
                {p.removed ? " (빠진 협력사)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="expense-supply" label="공급가액 (원)" required error={errors.supply}>
          <Input
            id="expense-supply"
            inputMode="numeric"
            value={supply ? Number(supply).toLocaleString("ko-KR") : ""}
            onChange={(e) => setSupply(digits(e.target.value))}
            aria-invalid={!!errors.supply}
            aria-describedby="expense-supply-message"
            placeholder="0"
          />
        </FormField>
        <TaxFields idPrefix="expense" taxType={taxType} vatRate={vatRate} onTaxTypeChange={setTaxType} onVatRateChange={setVatRate} error={errors.vatRate} />
      </div>
      <p className="-mt-2 text-sm tabular-nums text-muted-foreground">
        부가세 {formatAmount(totals.vat.toString())} · 합계 <span className="font-medium text-foreground">{formatAmount(totals.total.toString())}</span>
      </p>

      {over > BigInt(0) && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>
            이 항목의 예산 {formatAmount(budget.toString())}을 {formatAmount(over.toString())} 넘습니다. 저장은 할 수 있습니다.
          </span>
        </p>
      )}

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">증빙 파일 (선택)</span>
        <AttachmentField value={files} onChange={setFiles} onUploadingChange={setUploading} />
      </div>

      <FormField id="expense-memo" label="메모">
        <Textarea id="expense-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={2} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "기록"}
        </Button>
      </DialogFooter>
    </form>
  );
}
