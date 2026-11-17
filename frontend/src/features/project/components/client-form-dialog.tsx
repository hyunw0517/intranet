"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { createProjectClient, updateProjectClient, type ProjectClientInput } from "@/services/api/project-clients";
import { formatBusinessNo, type ProjectClient } from "@/types/project";
import { useClientMutation } from "../hooks/use-projects";

export type ClientFormState = { mode: "create" } | { mode: "edit"; client: ProjectClient } | null;

// 거래처 등록·수정 (USER 이상 누구나) - 사업자등록번호는 하이픈을 넣어도 되고 숫자 10자리로 저장된다.
// 삭제되지 않은 거래처와 번호가 겹치면 서버가 400(겹친 거래처 이름 포함)을 낸다.
export function ClientFormDialog({ state, onClose }: { state: ClientFormState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">{state && <ClientForm state={state} onClose={onClose} onBusyChange={setBusy} />}</DialogContent>
    </Dialog>
  );
}

function ClientForm({ state, onClose, onBusyChange }: { state: NonNullable<ClientFormState>; onClose: () => void; onBusyChange: (b: boolean) => void }) {
  const editing = state.mode === "edit" ? state.client : null;

  const [values, setValues] = useState({
    name: editing?.name ?? "",
    businessNo: editing?.businessNo ? formatBusinessNo(editing.businessNo) : "",
    ceoName: editing?.ceoName ?? "",
    tel: editing?.tel ?? "",
    address: editing?.address ?? "",
    memo: editing?.memo ?? "",
  });
  const [errors, setErrors] = useState<{ name?: string; businessNo?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const create = useClientMutation(createProjectClient);
  const update = useClientMutation(({ id, input }: { id: number; input: Partial<ProjectClientInput> }) => updateProjectClient(id, input));
  const pending = create.isPending || update.isPending;

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const next: typeof errors = {};
    if (!values.name.trim()) next.name = "회사명을 입력해 주세요.";
    const digits = values.businessNo.replace(/[^0-9]/g, "");
    if (values.businessNo.trim() && digits.length !== 10) next.businessNo = "사업자등록번호는 숫자 10자리입니다.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setServerError(null);
    onBusyChange(true);
    const input: ProjectClientInput = {
      name: values.name.trim(),
      businessNo: digits || null,
      ceoName: values.ceoName.trim() || null,
      tel: values.tel.trim() || null,
      address: values.address.trim() || null,
      memo: values.memo.trim() || null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input });
      else await create.mutateAsync(input);
      toast.success(editing ? "거래처를 수정했습니다." : "거래처를 등록했습니다.");
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
        <DialogTitle>{editing ? "거래처 수정" : "거래처 등록"}</DialogTitle>
        <DialogDescription>누구나 등록·수정할 수 있고, 바뀐 내용은 변경 이력(감사 로그)에 남습니다.</DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      <FormField id="client-name" label="회사명" required error={errors.name}>
        <Input id="client-name" value={values.name} onChange={set("name")} maxLength={100} aria-invalid={!!errors.name} aria-describedby="client-name-message" autoFocus />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="client-bno" label="사업자등록번호" error={errors.businessNo} hint="예: 123-45-67890">
          <Input
            id="client-bno"
            value={values.businessNo}
            onChange={set("businessNo")}
            inputMode="numeric"
            maxLength={12}
            aria-invalid={!!errors.businessNo}
            aria-describedby="client-bno-message"
          />
        </FormField>
        <FormField id="client-ceo" label="대표자">
          <Input id="client-ceo" value={values.ceoName} onChange={set("ceoName")} maxLength={50} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="client-tel" label="대표 전화">
          <Input id="client-tel" value={values.tel} onChange={set("tel")} maxLength={20} inputMode="tel" />
        </FormField>
        <FormField id="client-address" label="주소">
          <Input id="client-address" value={values.address} onChange={set("address")} maxLength={200} />
        </FormField>
      </div>

      <FormField id="client-memo" label="메모">
        <Textarea id="client-memo" value={values.memo} onChange={set("memo")} maxLength={1000} rows={3} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "등록"}
        </Button>
      </DialogFooter>
    </form>
  );
}
