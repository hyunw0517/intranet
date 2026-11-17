"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentField } from "@/features/board/components/attachment-field";
import { getErrorMessage } from "@/lib/error-message";
import { createSale, updateSale, type SaleInput } from "@/services/api/project-sales";
import type { FileInfo } from "@/types/file";
import { formatAmount, type ConfirmedQuoteBalance, type ProjectSale, type QuoteTaxType } from "@/types/project";
import { useProjectMutation } from "../hooks/use-projects";
import { DEFAULT_VAT_RATE, quoteTotals, vatRateError } from "../quote-calc";
import { TaxFields } from "./tax-fields";

const NO_QUOTE = "none";
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const digits = (value: string) => value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);

export type SaleFormState = { mode: "create" } | { mode: "edit"; sale: ProjectSale } | null;

// 청구 건 등록·수정 (참여자 누구나, docs/design/projects.md 5-2장)
// - 공급가액만 입력하고 부가세·합계는 미리보기(서버가 다시 계산). 기본 과세 10%(부가세율 직접 입력), 견적을 고르면 그 견적의 과세·부가세율로 채운다.
// - 확정 견적을 고르면 청구 잔액을 보여 준다(넘으면 서버 400).
// - 등록할 때 [바로 청구]를 체크하면 청구일·승인번호·세금계산서를 함께 넣어 "청구"로 만든다.
// - 청구한 건은 청구명·승인번호·메모·세금계산서만 고칠 수 있다(금액은 취소 후 다시 등록).
export function SaleFormDialog({
  projectId,
  quotes,
  state,
  onClose,
}: {
  projectId: number;
  quotes: ConfirmedQuoteBalance[];
  state: SaleFormState;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {state && <SaleForm projectId={projectId} quotes={quotes} state={state} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

function SaleForm({
  projectId,
  quotes,
  state,
  onClose,
  onBusyChange,
}: {
  projectId: number;
  quotes: ConfirmedQuoteBalance[];
  state: NonNullable<SaleFormState>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const editing = state.mode === "edit" ? state.sale : null;
  const amountLocked = editing?.status === "BILLED"; // 청구 뒤에는 금액·견적·과세·예정일 잠금

  const [title, setTitle] = useState(editing?.title ?? "");
  const [quoteVersionId, setQuoteVersionId] = useState(editing?.quoteVersionId ? String(editing.quoteVersionId) : NO_QUOTE);
  const [taxType, setTaxType] = useState<QuoteTaxType>(editing?.taxType ?? "TAXABLE");
  const [vatRate, setVatRate] = useState(editing?.vatRate ?? DEFAULT_VAT_RATE);
  const [supply, setSupply] = useState(editing?.supplyAmount ?? "");
  const [plannedDate, setPlannedDate] = useState(editing?.plannedDate?.slice(0, 10) ?? "");
  const [billNow, setBillNow] = useState(false);
  const [billedDate, setBilledDate] = useState(kstToday());
  const [taxInvoiceNo, setTaxInvoiceNo] = useState(editing?.taxInvoiceNo ?? "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [files, setFiles] = useState<FileInfo[]>(editing?.files ?? []);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; supply?: string; vatRate?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const create = useProjectMutation((input: SaleInput & { title: string; supplyAmount: number }) => createSale(projectId, input));
  const update = useProjectMutation((input: SaleInput) => updateSale(projectId, editing!.id, input));
  const pending = create.isPending || update.isPending;

  // 미리보기: 공급가액 1행으로 견적과 같은 계산 (서버 calcSaleAmounts와 같은 규칙)
  const totals = quoteTotals([{ quantity: "1", unitPrice: supply || "0" }], taxType, vatRate);
  const rateError = vatRateError(vatRate); // 면세면 검사하지 않고 보내지도 않는다
  const selectedQuote = quotes.find((q) => String(q.id) === quoteVersionId);
  // 수정 중이면 이 건의 기존 금액은 잔액에 다시 더해서 보여 준다
  const remaining = selectedQuote
    ? BigInt(selectedQuote.remaining) + (editing && editing.quoteVersionId === selectedQuote.id && editing.status !== "CANCELLED" ? BigInt(editing.totalAmount) : BigInt(0))
    : null;

  const chooseQuote = (value: string) => {
    setQuoteVersionId(value);
    const q = quotes.find((x) => String(x.id) === value);
    if (q) {
      // 견적의 과세 구분·부가세율로 채운다 (바꿀 수 있음)
      setTaxType(q.taxType);
      setVatRate(q.vatRate);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || uploading) return;
    const next: typeof errors = {};
    if (!title.trim()) next.title = "청구명을 입력해 주세요.";
    if (!amountLocked && !supply) next.supply = "공급가액을 입력해 주세요.";
    else if (!amountLocked && totals.overflow) next.supply = "금액이 너무 큽니다.";
    else if (!amountLocked && remaining !== null && totals.total > remaining) next.supply = `견적 잔액(${formatAmount(remaining.toString())})을 넘습니다.`;
    if (!amountLocked && taxType === "TAXABLE" && rateError) next.vatRate = rateError;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    onBusyChange(true);
    const common = { title: title.trim(), taxInvoiceNo: taxInvoiceNo.trim() || null, memo: memo.trim() || null, attachmentIds: files.map((f) => f.id) };
    const amountFields = {
      quoteVersionId: quoteVersionId === NO_QUOTE ? null : Number(quoteVersionId),
      taxType,
      vatRate: rateError ? undefined : Number(vatRate),
      supplyAmount: Number(supply),
      plannedDate: plannedDate || null,
    };
    try {
      if (editing) {
        await update.mutateAsync(amountLocked ? common : { ...common, ...amountFields });
        toast.success("매출을 저장했습니다.");
      } else {
        await create.mutateAsync({ ...common, ...amountFields, billedDate: billNow ? billedDate : null });
        toast.success(billNow ? "청구를 등록했습니다." : "청구 예정을 등록했습니다.");
      }
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      onBusyChange(false);
    }
  };

  const showInvoice = billNow || editing?.status === "BILLED";

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "매출 수정" : "매출 등록"}</DialogTitle>
        <DialogDescription>
          {amountLocked ? "청구한 건은 금액을 바꿀 수 없습니다. 바꾸려면 취소한 뒤 다시 등록해 주세요." : "공급가액을 입력하면 부가세와 합계는 자동으로 계산됩니다."}
        </DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      <FormField id="sale-title" label="청구명" required error={errors.title} hint="예: 계약금, 중도금, 잔금">
        <Input id="sale-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-invalid={!!errors.title} aria-describedby="sale-title-message" />
      </FormField>

      <FormField
        id="sale-quote"
        label="확정 견적 (선택)"
        hint={remaining !== null ? `견적 합계 ${formatAmount(selectedQuote!.totalAmount)} · 청구 가능 잔액 ${formatAmount(remaining.toString())}` : undefined}
      >
        <Select value={quoteVersionId} onValueChange={chooseQuote} disabled={amountLocked}>
          <SelectTrigger id="sale-quote" className="w-full" aria-describedby="sale-quote-message">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_QUOTE}>견적 없이</SelectItem>
            {quotes.map((q) => (
              <SelectItem key={q.id} value={String(q.id)}>
                {q.quote.quoteNo} v{q.version} · {q.quote.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="sale-supply" label="공급가액 (원)" required error={errors.supply}>
          <Input
            id="sale-supply"
            inputMode="numeric"
            value={supply ? Number(supply).toLocaleString("ko-KR") : ""}
            onChange={(e) => setSupply(digits(e.target.value))}
            disabled={amountLocked}
            aria-invalid={!!errors.supply}
            aria-describedby="sale-supply-message"
            placeholder="0"
          />
        </FormField>
        <TaxFields
          idPrefix="sale"
          taxType={taxType}
          vatRate={vatRate}
          onTaxTypeChange={setTaxType}
          onVatRateChange={setVatRate}
          disabled={amountLocked}
          error={errors.vatRate}
        />
      </div>
      <p className="-mt-2 text-sm tabular-nums text-muted-foreground">
        부가세 {formatAmount(totals.vat.toString())} · 합계 <span className="font-medium text-foreground">{formatAmount(totals.total.toString())}</span>
      </p>

      {!amountLocked && (
        <FormField id="sale-planned" label="청구 예정일">
          <Input id="sale-planned" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
        </FormField>
      )}

      {!editing && (
        <div className="flex items-center gap-2">
          <Checkbox id="sale-bill-now" checked={billNow} onCheckedChange={(c) => setBillNow(c === true)} />
          <Label htmlFor="sale-bill-now">바로 청구 (세금계산서를 이미 발행한 경우)</Label>
        </div>
      )}

      {showInvoice && (
        <div className="grid gap-4 rounded-md border p-3">
          {billNow && (
            <FormField id="sale-billed" label="청구일 (매출 기준일)" required>
              <Input id="sale-billed" type="date" value={billedDate} onChange={(e) => setBilledDate(e.target.value || kstToday())} />
            </FormField>
          )}
          <FormField id="sale-invoice" label="세금계산서 승인번호" hint="국세청 승인번호 (선택)">
            <Input id="sale-invoice" value={taxInvoiceNo} onChange={(e) => setTaxInvoiceNo(e.target.value.replace(/[^0-9-]/g, "").slice(0, 30))} />
          </FormField>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">세금계산서 파일</span>
            <AttachmentField value={files} onChange={setFiles} onUploadingChange={setUploading} />
          </div>
        </div>
      )}

      <FormField id="sale-memo" label="메모">
        <Textarea id="sale-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} rows={2} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "등록"}
        </Button>
      </DialogFooter>
    </form>
  );
}
