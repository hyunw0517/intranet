"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { createQuote, updateQuoteVersion, type QuoteInput } from "@/services/api/project-quotes";
import { formatAmount, type QuoteTaxType, type QuoteVersion } from "@/types/project";
import { useProjectClient, useProjectMutation } from "../hooks/use-projects";
import { DEFAULT_VAT_RATE, quoteTotals, vatRateError } from "../quote-calc";
import { TaxFields } from "./tax-fields";

const NO_CONTACT = "none";
const MAX_ITEMS = 100;

// 입력 중 품목 (숫자는 문자열로 들고 있다가 저장할 때 숫자로 바꾼다 - 입력 중 빈칸 허용)
interface ItemRow {
  key: number;
  name: string;
  spec: string;
  quantity: string;
  unitPrice: string;
  note: string;
}

let keySeq = 0;
const newRow = (init: Partial<ItemRow> = {}): ItemRow => ({ key: ++keySeq, name: "", spec: "", quantity: "1", unitPrice: "", note: "", ...init });
const digits = (value: string, max: number) => value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, max);

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// 견적 작성(v1)·작성 중 버전 수정 화면
// - 금액은 미리보기이고 저장 값은 서버가 다시 계산한다.
// - 수신 담당자는 발주처 담당자 중에서 고르고, 저장할 때마다 스냅샷이 찍힌다.
export function QuoteEditor({
  projectId,
  clientId,
  quoteId,
  title: initialTitle,
  version,
  onDone,
}: {
  projectId: number;
  clientId: number;
  quoteId?: number; // 없으면 새 견적
  title?: string;
  version?: QuoteVersion; // 수정할 버전
  onDone?: () => void;
}) {
  const router = useRouter();
  const editing = !!version;

  const [title, setTitle] = useState(initialTitle ?? "");
  const [taxType, setTaxType] = useState<QuoteTaxType>(version?.taxType ?? "TAXABLE");
  const [vatRate, setVatRate] = useState(version?.vatRate ?? DEFAULT_VAT_RATE);
  const [quoteDate, setQuoteDate] = useState(version?.quoteDate.slice(0, 10) ?? kstToday());
  const [validUntil, setValidUntil] = useState(version?.validUntil?.slice(0, 10) ?? "");
  const [contactId, setContactId] = useState(version?.contactId ? String(version.contactId) : NO_CONTACT);
  const [note, setNote] = useState(version?.note ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() =>
    version && version.items.length > 0
      ? version.items.map((i) => newRow({ name: i.name, spec: i.spec ?? "", quantity: String(i.quantity), unitPrice: i.unitPrice, note: i.note ?? "" }))
      : [newRow()],
  );
  const [errors, setErrors] = useState<{ title?: string; items?: string; validUntil?: string; vatRate?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const client = useProjectClient(clientId);
  const contacts = client.data?.contacts ?? [];

  const create = useProjectMutation((input: QuoteInput & { title: string }) => createQuote(projectId, input));
  const update = useProjectMutation((input: QuoteInput) => updateQuoteVersion(projectId, quoteId!, version!.id, input));
  const pending = create.isPending || update.isPending;

  const totals = quoteTotals(rows, taxType, vatRate);
  const rateError = vatRateError(vatRate); // 면세면 검사하지 않고 보내지도 않는다(서버는 저장된 값·기본 10% 유지)

  const setRow = (key: number, patch: Partial<ItemRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const moveRow = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row);
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    // 완전히 빈 행은 무시하고, 일부만 입력한 행은 오류
    const filled = rows.filter((r) => r.name.trim() || r.spec.trim() || r.unitPrice || r.note.trim());
    const next: typeof errors = {};
    if (!title.trim()) next.title = "견적명을 입력해 주세요.";
    if (filled.some((r) => !r.name.trim() || !r.unitPrice || !r.quantity || Number(r.quantity) < 1)) {
      next.items = "품목마다 품목명·수량(1 이상)·단가를 입력해 주세요.";
    } else if (quoteTotals(filled, taxType, vatRate).overflow) {
      next.items = "금액이 너무 큽니다. (최대 999,999,999,999,999원)";
    }
    if (validUntil && validUntil < quoteDate) next.validUntil = "유효기간은 견적일 이후여야 합니다.";
    if (taxType === "TAXABLE" && rateError) next.vatRate = rateError;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    const input: QuoteInput = {
      title: title.trim(),
      taxType,
      vatRate: rateError ? undefined : Number(vatRate),
      quoteDate,
      validUntil: validUntil || null,
      contactId: contactId === NO_CONTACT ? null : Number(contactId),
      note: note.trim() || null,
      items: filled.map((r) => ({
        name: r.name.trim(),
        spec: r.spec.trim() || null,
        quantity: Number(r.quantity),
        unitPrice: Number(r.unitPrice), // 999조 이하라 Number로 정확하다
        note: r.note.trim() || null,
      })),
    };

    try {
      if (editing) {
        await update.mutateAsync(input);
        toast.success("견적을 저장했습니다.");
        onDone?.();
      } else {
        const created = await create.mutateAsync({ ...input, title: title.trim() });
        toast.success(`견적 ${created.quoteNo}를 만들었습니다.`);
        router.push(`/projects/${projectId}/quotes/${created.id}`);
      }
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <FormError message={serverError} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="quote-title" label="견적명" required error={errors.title} className="sm:col-span-2">
          <Input id="quote-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-invalid={!!errors.title} aria-describedby="quote-title-message" />
        </FormField>
        <TaxFields idPrefix="quote" taxType={taxType} vatRate={vatRate} onTaxTypeChange={setTaxType} onVatRateChange={setVatRate} error={errors.vatRate} />
        <FormField id="quote-contact" label="수신 담당자" hint={client.data ? `${client.data.name}의 담당자` : undefined}>
          <Select value={contactId} onValueChange={setContactId}>
            <SelectTrigger id="quote-contact" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CONTACT}>지정 안 함</SelectItem>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.jobTitle ? ` ${c.jobTitle}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="quote-date" label="견적일" required>
          <Input id="quote-date" type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value || kstToday())} />
        </FormField>
        <FormField id="quote-valid" label="유효기간" error={errors.validUntil}>
          <Input id="quote-valid" type="date" value={validUntil} min={quoteDate} onChange={(e) => setValidUntil(e.target.value)} aria-invalid={!!errors.validUntil} />
        </FormField>
      </div>

      <section className="grid gap-2" aria-labelledby="quote-items-label">
        <div className="flex items-center justify-between">
          <h2 id="quote-items-label" className="text-sm font-medium">
            품목 <span className="text-muted-foreground">{rows.length}</span>
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, newRow()])} disabled={rows.length >= MAX_ITEMS}>
            <Plus aria-hidden />
            품목 추가
          </Button>
        </div>
        {errors.items && (
          <p role="alert" className="text-xs text-destructive">
            {errors.items}
          </p>
        )}

        {/* 품목 표: 좁은 화면에서는 가로 스크롤 */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="w-10 px-2 py-2 text-center font-medium">No</th>
                <th className="px-2 py-2 font-medium">품목명</th>
                <th className="w-32 px-2 py-2 font-medium">규격</th>
                <th className="w-24 px-2 py-2 font-medium">수량</th>
                <th className="w-40 px-2 py-2 font-medium">단가 (원)</th>
                <th className="w-40 px-2 py-2 text-right font-medium">금액</th>
                <th className="w-36 px-2 py-2 font-medium">비고</th>
                <th className="w-28 px-2 py-2"><span className="sr-only">순서·삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-t">
                  <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <Input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} maxLength={200} aria-label={`${i + 1}번 품목명`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={r.spec} onChange={(e) => setRow(r.key, { spec: e.target.value })} maxLength={200} aria-label={`${i + 1}번 규격`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input inputMode="numeric" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: digits(e.target.value, 7) })} aria-label={`${i + 1}번 수량`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      inputMode="numeric"
                      value={r.unitPrice ? Number(r.unitPrice).toLocaleString("ko-KR") : ""}
                      onChange={(e) => setRow(r.key, { unitPrice: digits(e.target.value, 15) })}
                      aria-label={`${i + 1}번 단가`}
                      placeholder="0"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatAmount(totals.amounts[i].toString())}</td>
                  <td className="px-2 py-1.5">
                    <Input value={r.note} onChange={(e) => setRow(r.key, { note: e.target.value })} maxLength={200} aria-label={`${i + 1}번 비고`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveRow(i, -1)} disabled={i === 0} aria-label={`${i + 1}번 위로`}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} aria-label={`${i + 1}번 아래로`}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} aria-label={`${i + 1}번 삭제`}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto grid w-full max-w-xs gap-1 text-sm tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">공급가액</dt>
            <dd>{formatAmount(totals.supply.toString())}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">부가세</dt>
            <dd>{formatAmount(totals.vat.toString())}</dd>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <dt>합계</dt>
            <dd>{formatAmount(totals.total.toString())}</dd>
          </div>
        </dl>
      </section>

      <FormField id="quote-note" label="비고·특기사항">
        <Textarea id="quote-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
      </FormField>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => (onDone ? onDone() : router.push(`/projects/${projectId}`))} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "견적 만들기"}
        </Button>
      </div>
    </form>
  );
}
