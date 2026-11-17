"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error-message";
import {
  createProjectClientContact,
  deleteProjectClient,
  deleteProjectClientContact,
  updateProjectClientContact,
  type ProjectClientContactInput,
} from "@/services/api/project-clients";
import { formatBusinessNo, type ProjectClient, type ProjectClientContact } from "@/types/project";
import { useClientMutation, useProjectClient } from "../hooks/use-projects";

// 거래처 상세 - 기본 정보 + 담당자(여러 명) 관리 + 수정·삭제 (USER 이상 누구나)
// 삭제해도 연결된 프로젝트에는 실제 이름이 그대로 남는다. 삭제된 거래처는 [삭제된 거래처] 탭에서 복구한다.
export function ClientDetailDialog({ clientId, onClose, onEdit }: { clientId: number | null; onClose: () => void; onEdit: (client: ProjectClient) => void }) {
  return (
    <Dialog open={clientId !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">{clientId !== null && <ClientDetail clientId={clientId} onClose={onClose} onEdit={onEdit} />}</DialogContent>
    </Dialog>
  );
}

function ClientDetail({ clientId, onClose, onEdit }: { clientId: number; onClose: () => void; onEdit: (client: ProjectClient) => void }) {
  const { data: client, isPending, isError, error, refetch } = useProjectClient(clientId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useClientMutation(deleteProjectClient);

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const counts = client._count;

  const runDelete = async () => {
    try {
      await remove.mutateAsync(client.id);
      toast.success("거래처를 삭제했습니다.");
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const info: [string, string][] = [
    ["사업자등록번호", formatBusinessNo(client.businessNo)],
    ["대표자", client.ceoName ?? "-"],
    ["대표 전화", client.tel ?? "-"],
    ["주소", client.address ?? "-"],
  ];

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>
          {client.name}
          {client.deleted && <span className="ml-2 text-sm font-normal text-muted-foreground">(삭제된 거래처)</span>}
        </DialogTitle>
        <DialogDescription>{counts ? `발주 프로젝트 ${counts.projects}개 · 협력 프로젝트 ${counts.partners}개` : "거래처 정보와 담당자"}</DialogDescription>
      </DialogHeader>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {info.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {client.memo && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">{client.memo}</p>}

      {!client.deleted && (
        <>
          <ContactsSection client={client} />
          <div className="flex justify-between gap-2 border-t pt-4">
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              삭제
            </Button>
            <Button variant="outline" onClick={() => onEdit(client)}>
              <Pencil aria-hidden />
              정보 수정
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="거래처를 삭제할까요?"
        description="새 프로젝트에서는 고를 수 없게 되지만, 이미 연결된 프로젝트에는 이름이 그대로 남습니다. [삭제된 거래처]에서 복구할 수 있습니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runDelete}
      />
    </div>
  );
}

const EMPTY_CONTACT: ProjectClientContactInput = { name: "", department: "", jobTitle: "", hp: "", email: "", memo: "" };

// 담당자 목록 + 한 줄 편집 (추가·수정은 같은 입력 줄을 쓴다)
function ContactsSection({ client }: { client: ProjectClient }) {
  const contacts = client.contacts ?? [];
  const [editing, setEditing] = useState<{ id: number | null; values: ProjectClientContactInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProjectClientContact | null>(null);

  const save = useClientMutation(({ id, values }: { id: number | null; values: ProjectClientContactInput }) => {
    const input = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) as Partial<ProjectClientContactInput>;
    return id === null
      ? createProjectClientContact(client.id, { ...input, name: values.name.trim() })
      : updateProjectClientContact(client.id, id, input);
  });
  const remove = useClientMutation((id: number) => deleteProjectClientContact(client.id, id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || save.isPending) return;
    if (!editing.values.name.trim()) return setError("담당자 이름을 입력해 주세요.");
    setError(null);
    try {
      await save.mutateAsync(editing);
      toast.success(editing.id === null ? "담당자를 추가했습니다." : "담당자를 수정했습니다.");
      setEditing(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const runRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success("담당자를 삭제했습니다.");
      setRemoving(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const field = (key: keyof ProjectClientContactInput, label: string, type = "text") => (
    <Input
      aria-label={label}
      placeholder={label}
      type={type}
      value={editing?.values[key] ?? ""}
      onChange={(e) => setEditing((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: e.target.value } } : prev))}
    />
  );

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">담당자 {contacts.length}명</h3>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing({ id: null, values: EMPTY_CONTACT })}>
            <Plus aria-hidden />
            담당자 추가
          </Button>
        )}
      </div>

      {editing && (
        <form onSubmit={submit} className="grid gap-2 rounded-md border p-3">
          <FormError message={error} />
          <div className="grid gap-2 sm:grid-cols-3">
            {field("name", "이름 (필수)")}
            {field("department", "부서")}
            {field("jobTitle", "직책")}
            {field("hp", "연락처", "tel")}
            {field("email", "이메일", "email")}
            {field("memo", "메모")}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(null); setError(null); }} disabled={save.isPending}>
              취소
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {editing.id === null ? "추가" : "저장"}
            </Button>
          </div>
        </form>
      )}

      {contacts.length === 0 ? (
        !editing && <p className="text-sm text-muted-foreground">등록된 담당자가 없습니다.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground"> {[c.department, c.jobTitle].filter(Boolean).join(" · ")}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{[c.hp, c.email, c.memo].filter(Boolean).join(" · ") || "-"}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${c.name} 수정`}
                  onClick={() =>
                    setEditing({
                      id: c.id,
                      values: { name: c.name, department: c.department ?? "", jobTitle: c.jobTitle ?? "", hp: c.hp ?? "", email: c.email ?? "", memo: c.memo ?? "" },
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`${c.name} 삭제`} onClick={() => setRemoving(c)}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="담당자를 삭제할까요?"
        description={`${removing?.name ?? ""} 담당자를 목록에서 뺍니다. 이미 발행한 견적서에 적힌 담당자 정보는 바뀌지 않습니다.`}
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runRemove}
      />
    </section>
  );
}
