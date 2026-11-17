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
import { formatAmount, type ProjectPartner } from "@/types/project";
import { useProjectClients, useProjectMutation, useProjectPartners } from "../hooks/use-projects";
import { formatPeriod } from "./project-badges";

// Decimal(15,0) 최대값. tsconfig target이 ES2020 미만이라 BigInt 리터럴(123n) 대신 BigInt()를 쓴다.
const MAX_AMOUNT = BigInt("999999999999999");

type FormState = { mode: "create" } | { mode: "edit"; partner: ProjectPartner } | null;

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
  const total = partners.reduce((sum, p) => sum + BigInt(p.contractAmount ?? "0"), BigInt(0));

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
                <TableHead className="w-40 text-right">계약 금액</TableHead>
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
                  <TableCell className="tabular-nums text-muted-foreground">{formatPeriod(p.startDate, p.endDate)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.contactName ?? "-"}
                    {(p.contactHp || p.contactEmail) && <span className="block text-xs">{[p.contactHp, p.contactEmail].filter(Boolean).join(" · ")}</span>}
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
                <TableCell colSpan={2}>외주 계약 금액 합계 (부가세 별도)</TableCell>
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
      <DialogContent className="sm:max-w-lg">
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
  const [startDate, setStartDate] = useState(toDateInputValue(editing?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(editing?.endDate));
  const [contactName, setContactName] = useState(editing?.contactName ?? "");
  const [contactHp, setContactHp] = useState(editing?.contactHp ?? "");
  const [contactEmail, setContactEmail] = useState(editing?.contactEmail ?? "");
  const [errors, setErrors] = useState<{ client?: string; amount?: string; period?: string }>({});
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
    if (amount && BigInt(amount) > MAX_AMOUNT) next.amount = "금액이 너무 큽니다.";
    if (startDate && endDate && startDate > endDate) next.period = "계약 시작일은 종료일보다 늦을 수 없습니다.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    onBusyChange(true);
    const input = {
      workScope: workScope.trim() || null,
      contractAmount: amount ? Number(amount) : null, // 999조 이하라 Number로 정확히 표현된다
      startDate: startDate || null,
      endDate: endDate || null,
      contactName: contactName.trim() || null,
      contactHp: contactHp.trim() || null,
      contactEmail: contactEmail.trim() || null,
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

      <FormField
        id="partner-amount"
        label="외주 계약 금액 (원, 부가세 별도)"
        error={errors.amount}
        hint={amount ? formatAmount(amount) : undefined}
      >
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

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="partner-start" label="계약 시작일" error={errors.period}>
          <Input id="partner-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.period} />
        </FormField>
        <FormField id="partner-end" label="계약 종료일">
          <Input id="partner-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="partner-contact" label="담당자">
          <Input id="partner-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={50} />
        </FormField>
        <FormField id="partner-hp" label="연락처">
          <Input id="partner-hp" value={contactHp} onChange={(e) => setContactHp(e.target.value)} maxLength={20} inputMode="tel" />
        </FormField>
        <FormField id="partner-email" label="이메일">
          <Input id="partner-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={100} />
        </FormField>
      </div>

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
