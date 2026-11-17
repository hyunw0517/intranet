"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { toDateInputValue } from "@/lib/format";
import {
  createProjectPartner,
  removeProjectPartner,
  updateProjectPartner,
  type ProjectPartnerInput,
} from "@/services/api/projects";
import { formatAmount, formatTax, type ProjectPartner, type QuoteTaxType } from "@/types/project";
import { useProjectClients, useProjectMutation, useProjectPartners } from "../hooks/use-projects";
import { DEFAULT_VAT_RATE, quoteTotals, vatRateError } from "../quote-calc";
import { formatPeriod } from "./project-badges";
import { TaxFields } from "./tax-fields";

type FormState = { mode: "create" } | { mode: "edit"; partner: ProjectPartner } | null;

// 담당자 입력 행 (직접 기재, 여러 명 - 2026-11-17 사용자 결정). 서버 최대 20명
const MAX_CONTACTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
interface ContactRow {
  key: number;
  name: string;
  role: string;
  hp: string;
  email: string;
}
let contactKeySeq = 0;
const newContact = (init: Partial<ContactRow> = {}): ContactRow => ({ key: ++contactKeySeq, name: "", role: "", hp: "", email: "", ...init });

// 협력사 탭 - 하청기업 목록 (2026-11-17 사용자 결정: 참여자 누구나 관리, 금액도 참여자 전원)
// 회사는 거래처 목록에서 고르고, 업무 범위·외주 계약 금액·계약 기간·담당자는 직접 적는다.
// 금액은 서버가 문자열(Decimal)로 주므로 합계도 BigInt로 더한다(Number로 바꾸면 큰 금액에서 정밀도가 깨질 수 있다).
export function ProjectPartners({ projectId }: { projectId: number }) {
  const { data, isPending, isError, error, refetch } = useProjectPartners(projectId);
  const [form, setForm] = useState<FormState>(null);
  const [removing, setRemoving] = useState<ProjectPartner | null>(null);
  const remove = useProjectMutation((id: number) => removeProjectPartner(projectId, id));

  const runRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success(`${removing.client.name}을(를) 협력사에서 뺐습니다.`);
      setRemoving(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const partners = data ?? [];
  const supplyTotal = partners.reduce((sum, p) => sum + BigInt(p.contractAmount ?? "0"), BigInt(0));
  const total = partners.reduce((sum, p) => sum + BigInt(p.totalAmount ?? "0"), BigInt(0));

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">이 프로젝트의 일을 맡긴 하청기업입니다. 회사 정보는 거래처에서 관리합니다.</p>
        <Button onClick={() => setForm({ mode: "create" })}>
          <Plus aria-hidden />
          협력사 추가
        </Button>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : partners.length === 0 ? (
        <EmptyState message="등록된 협력사가 없습니다." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회사</TableHead>
                <TableHead>업무 범위</TableHead>
                <TableHead className="w-36 text-right">공급가액</TableHead>
                <TableHead className="w-44 text-right">합계 (부가세 포함)</TableHead>
                <TableHead className="w-48">계약 기간</TableHead>
                <TableHead>담당자</TableHead>
                <TableHead className="w-20"><span className="sr-only">관리</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.client.name}
                    {p.client.deleted && <span className="ml-1 text-xs font-normal text-muted-foreground">(삭제된 거래처)</span>}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground" title={p.workScope ?? undefined}>
                    {p.workScope ?? "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(p.contractAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(p.totalAmount)}
                    {p.contractAmount !== null && (
                      <span className="block text-xs text-muted-foreground">
                        {formatTax(p.taxType, p.vatRate)}
                        {p.taxType === "TAXABLE" && ` · ${formatAmount(p.vatAmount)}`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatPeriod(p.startDate, p.endDate)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.contacts.length === 0 ? (
                      "-"
                    ) : (
                      <ul className="grid gap-1">
                        {p.contacts.map((c) => (
                          <li key={c.id}>
                            {c.name}
                            {c.role && <span className="text-xs"> ({c.role})</span>}
                            {(c.hp || c.email) && <span className="block text-xs">{[c.hp, c.email].filter(Boolean).join(" · ")}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`${p.client.name} 수정`} onClick={() => setForm({ mode: "edit", partner: p })}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`${p.client.name} 빼기`} onClick={() => setRemoving(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>외주 계약 금액 합계</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(supplyTotal.toString())}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(total.toString())}</TableCell>
                <TableCell colSpan={3} />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      <PartnerFormDialog projectId={projectId} existingClientIds={partners.map((p) => p.clientId)} state={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="협력사를 뺄까요?"
        description={`${removing?.client.name ?? ""}을(를) 이 프로젝트의 협력사 목록에서 뺍니다. 기록은 보관되고, 거래처 정보는 그대로입니다.`}
        confirmLabel="빼기"
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
      />
    </div>
  );
}

function PartnerFormDialog({
  projectId,
  existingClientIds,
  state,
  onClose,
}: {
  projectId: number;
  existingClientIds: number[];
  state: FormState;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {state && <PartnerForm projectId={projectId} existingClientIds={existingClientIds} state={state} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

function PartnerForm({
  projectId,
  existingClientIds,
  state,
  onClose,
  onBusyChange,
}: {
  projectId: number;
  existingClientIds: number[];
  state: NonNullable<FormState>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const editing = state.mode === "edit" ? state.partner : null;

  const [clientId, setClientId] = useState(editing ? String(editing.clientId) : "");
  const [workScope, setWorkScope] = useState(editing?.workScope ?? "");
  const [amount, setAmount] = useState(editing?.contractAmount ?? ""); // 숫자만 (표시는 아래 미리보기)
  const [taxType, setTaxType] = useState<QuoteTaxType>(editing?.taxType ?? "TAXABLE");
  const [vatRate, setVatRate] = useState(editing?.vatRate ?? DEFAULT_VAT_RATE);
  const [startDate, setStartDate] = useState(toDateInputValue(editing?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(editing?.endDate));
  const [contacts, setContacts] = useState<ContactRow[]>(() =>
    editing && editing.contacts.length > 0
      ? editing.contacts.map((c) => newContact({ name: c.name, role: c.role ?? "", hp: c.hp ?? "", email: c.email ?? "" }))
      : [newContact()],
  );
  const [errors, setErrors] = useState<{ client?: string; amount?: string; period?: string; vatRate?: string; contacts?: string }>({});
  const setContact = (key: number, patch: Partial<ContactRow>) => setContacts((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  // 미리보기: 공급가액 1행으로 견적과 같은 계산 (서버가 다시 계산해 저장)
  const totals = quoteTotals([{ quantity: "1", unitPrice: amount || "0" }], taxType, vatRate);
  const rateError = vatRateError(vatRate); // 면세면 검사하지 않고 보내지도 않는다
  const [serverError, setServerError] = useState<string | null>(null);

  // 거래처 선택지 (만들 때만, 삭제되지 않은 거래처 최대 100개, 이미 협력사인 회사는 제외)
  const clients = useProjectClients({ take: 100 }, !editing);
  const options = (clients.data?.data ?? []).filter((c) => !existingClientIds.includes(c.id));

  const create = useProjectMutation((input: ProjectPartnerInput) => createProjectPartner(projectId, input));
  const update = useProjectMutation(({ id, input }: { id: number; input: Partial<ProjectPartnerInput> }) => updateProjectPartner(projectId, id, input));
  const pending = create.isPending || update.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: typeof errors = {};
    if (!editing && !clientId) next.client = "협력사로 추가할 거래처를 골라 주세요.";
    if (amount && totals.overflow) next.amount = "금액이 너무 큽니다. (부가세 포함 최대 999,999,999,999,999원)";
    if (taxType === "TAXABLE" && rateError) next.vatRate = rateError;
    if (startDate && endDate && startDate > endDate) next.period = "계약 시작일은 종료일보다 늦을 수 없습니다.";
    // 완전히 빈 담당자 행은 무시하고, 일부만 적은 행은 이름이 있어야 한다
    const filled = contacts.filter((c) => c.name.trim() || c.role.trim() || c.hp.trim() || c.email.trim());
    if (filled.some((c) => !c.name.trim())) next.contacts = "담당자마다 이름을 입력해 주세요.";
    else if (filled.some((c) => c.email.trim() && !EMAIL_PATTERN.test(c.email.trim()))) next.contacts = "이메일 형식을 확인해 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    onBusyChange(true);
    const input = {
      workScope: workScope.trim() || null,
      contractAmount: amount ? Number(amount) : null, // 999조 이하라 Number로 정확히 표현된다
      taxType,
      vatRate: rateError ? undefined : Number(vatRate),
      startDate: startDate || null,
      endDate: endDate || null,
      contacts: filled.map((c) => ({ name: c.name.trim(), role: c.role.trim() || null, hp: c.hp.trim() || null, email: c.email.trim() || null })),
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input });
      else await create.mutateAsync({ ...input, clientId: Number(clientId) });
      toast.success(editing ? "협력사 정보를 저장했습니다." : "협력사를 추가했습니다.");
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
        <DialogTitle>{editing ? `협력사 수정 - ${editing.client.name}` : "협력사 추가"}</DialogTitle>
        <DialogDescription>
          {editing ? "회사를 바꾸려면 빼고 새로 추가합니다." : "거래처 목록에서 회사를 고릅니다. 목록에 없으면 거래처 탭에서 먼저 등록해 주세요."}
        </DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      {!editing && (
        <FormField id="partner-client" label="회사" required error={errors.client ?? (clients.isError ? "거래처 목록을 불러오지 못했습니다." : undefined)}>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="partner-client" className="w-full" aria-invalid={!!errors.client} aria-describedby="partner-client-message">
              <SelectValue placeholder={clients.isPending ? "불러오는 중" : "거래처 선택"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      <FormField id="partner-scope" label="업무 범위">
        <Textarea id="partner-scope" value={workScope} onChange={(e) => setWorkScope(e.target.value)} maxLength={500} rows={2} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="partner-amount" label="외주 계약 금액 (공급가액, 원)" error={errors.amount}>
          <Input
            id="partner-amount"
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString("ko-KR") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "").slice(0, 15))}
            aria-invalid={!!errors.amount}
            aria-describedby="partner-amount-message"
            placeholder="0"
          />
        </FormField>
        <TaxFields idPrefix="partner" taxType={taxType} vatRate={vatRate} onTaxTypeChange={setTaxType} onVatRateChange={setVatRate} error={errors.vatRate} />
      </div>
      {amount && (
        <p className="-mt-2 text-sm tabular-nums text-muted-foreground">
          부가세 {formatAmount(totals.vat.toString())} · 합계 <span className="font-medium text-foreground">{formatAmount(totals.total.toString())}</span>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="partner-start" label="계약 시작일" error={errors.period}>
          <Input id="partner-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.period} />
        </FormField>
        <FormField id="partner-end" label="계약 종료일">
          <Input id="partner-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>

      <section className="grid gap-2" aria-labelledby="partner-contacts-label">
        <div className="flex items-center justify-between">
          <h3 id="partner-contacts-label" className="text-sm font-medium">
            담당자 <span className="text-muted-foreground">{contacts.length}</span>
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContacts((prev) => [...prev, newContact()])}
            disabled={contacts.length >= MAX_CONTACTS}
          >
            <Plus aria-hidden />
            담당자 추가
          </Button>
        </div>
        {errors.contacts && (
          <p role="alert" className="text-xs text-destructive">
            {errors.contacts}
          </p>
        )}
        <ul className="grid gap-2">
          {contacts.map((c, i) => (
            <li key={c.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_6rem_1fr_1fr_auto]">
              <Input value={c.name} onChange={(e) => setContact(c.key, { name: e.target.value })} maxLength={50} placeholder="이름" aria-label={`${i + 1}번 담당자 이름`} />
              <Input value={c.role} onChange={(e) => setContact(c.key, { role: e.target.value })} maxLength={50} placeholder="역할" aria-label={`${i + 1}번 담당자 역할`} />
              <Input value={c.hp} onChange={(e) => setContact(c.key, { hp: e.target.value })} maxLength={20} inputMode="tel" placeholder="연락처" aria-label={`${i + 1}번 담당자 연락처`} />
              <Input value={c.email} onChange={(e) => setContact(c.key, { email: e.target.value })} maxLength={100} type="email" placeholder="이메일" aria-label={`${i + 1}번 담당자 이메일`} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="justify-self-end self-center"
                onClick={() => setContacts((prev) => prev.filter((x) => x.key !== c.key))}
                aria-label={`${i + 1}번 담당자 삭제`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}
