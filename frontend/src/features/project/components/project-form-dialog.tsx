"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import { toDateInputValue } from "@/lib/format";
import { createProject, updateProject, type ProjectInput } from "@/services/api/projects";
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES, type ProjectDetail, type ProjectStatus } from "@/types/project";
import { useProjectClients, useProjectMutation } from "../hooks/use-projects";

const NO_CLIENT = "none";

export type ProjectFormState = { mode: "create" } | { mode: "edit"; project: ProjectDetail } | null;

// 프로젝트 만들기·수정 창
// - 만든 사람이 책임자가 되고 상세 화면으로 이동한다.
// - 기간은 선택이고 둘 다 있으면 시작 <= 종료
export function ProjectFormDialog({ state, onClose }: { state: ProjectFormState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      {/* 에디터 도구 막대가 들어가도록 넓히고, 내용이 길면 창 안에서 스크롤 */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">{state && <ProjectForm state={state} onClose={onClose} onBusyChange={setBusy} />}</DialogContent>
    </Dialog>
  );
}

function ProjectForm({
  state,
  onClose,
  onBusyChange,
}: {
  state: NonNullable<ProjectFormState>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.project : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(editing?.status ?? "PLANNED");
  const [startDate, setStartDate] = useState(toDateInputValue(editing?.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(editing?.endDate));
  const [clientId, setClientId] = useState(editing?.clientId ? String(editing.clientId) : NO_CLIENT);
  const [errors, setErrors] = useState<{ name?: string; period?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // 거래처 선택지: 삭제되지 않은 거래처 (이미 연결된 삭제 거래처는 따로 넣어 둔다)
  const clients = useProjectClients({ take: 100 });
  const options = clients.data?.data ?? [];
  const linkedDeleted = editing?.client?.deleted ? editing.client : null;

  const create = useProjectMutation(createProject);
  const update = useProjectMutation(({ id, input }: { id: number; input: Partial<ProjectInput> }) => updateProject(id, input));
  const pending = create.isPending || update.isPending;

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "프로젝트명을 입력해 주세요.";
    else if (name.trim().length > 100) next.name = "프로젝트명은 100자 이하로 입력해 주세요.";
    if (startDate && endDate && startDate > endDate) next.period = "시작일은 종료일보다 늦을 수 없습니다.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !validate()) return;
    setServerError(null);
    onBusyChange(true);

    const input: ProjectInput = {
      name: name.trim(),
      description: description || null, // 에디터 HTML (빈 본문이면 "")
      status,
      startDate: startDate || null,
      endDate: endDate || null,
      clientId: clientId === NO_CLIENT ? null : Number(clientId),
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
        toast.success("프로젝트를 수정했습니다.");
        onClose();
      } else {
        const created = await create.mutateAsync(input);
        toast.success("프로젝트를 만들었습니다.");
        onClose();
        router.push(`/projects/${created.id}`);
      }
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "프로젝트 수정" : "새 프로젝트"}</DialogTitle>
        <DialogDescription>{editing ? "프로젝트 정보를 바꿉니다." : "만든 사람이 책임자로 등록됩니다."}</DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      <FormField id="project-name" label="프로젝트명" required error={errors.name}>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-invalid={!!errors.name}
          aria-describedby="project-name-message"
          autoFocus
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="project-status" label="상태">
          <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
            <SelectTrigger id="project-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {PROJECT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField id="project-client" label="거래처" hint={clients.isError ? "거래처 목록을 불러오지 못했습니다." : undefined}>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id="project-client" className="w-full">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>없음</SelectItem>
              {linkedDeleted && <SelectItem value={String(linkedDeleted.id)}>{linkedDeleted.name} (삭제된 거래처)</SelectItem>}
              {options.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="project-start" label="시작일" error={errors.period}>
          <Input id="project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-invalid={!!errors.period} />
        </FormField>
        <FormField id="project-end" label="종료일">
          <Input id="project-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-1.5">
        <Label id="project-description-label">설명</Label>
        {/* 공용 에디터 (본문 이미지 없음 - 서버도 저장 시 이미지를 지운다) */}
        <RichTextEditor
          id="project-description"
          labelledBy="project-description-label"
          initialContent={editing?.description ?? ""}
          allowImages={false}
          onChange={(html, isEmpty) => setDescription(isEmpty ? "" : html)}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "만들기"}
        </Button>
      </DialogFooter>
    </form>
  );
}
