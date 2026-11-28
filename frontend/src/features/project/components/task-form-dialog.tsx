"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import { toDateInputValue } from "@/lib/format";
import {
  createProjectTask,
  deleteProjectTask,
  moveProjectTask,
  updateProjectTask,
  type ProjectTaskInput,
} from "@/services/api/projects";
import { TASK_STATUS_LABEL, TASK_STATUSES, type ProjectMember, type ProjectTask, type ProjectTaskStatus } from "@/types/project";
import { useProjectMutation } from "../hooks/use-projects";

const NO_ASSIGNEE = "none";

export type TaskFormState = { mode: "create"; status: ProjectTaskStatus } | { mode: "edit"; task: ProjectTask } | null;

interface TaskFormDialogProps {
  projectId: number;
  members: ProjectMember[];
  canManage: boolean;
  columnSize: (status: ProjectTaskStatus) => number; // 상태를 바꾸면 그 컬럼 맨 아래로 옮긴다
  state: TaskFormState;
  onClose: () => void;
}

// 과제 만들기·수정 창 (참여자 누구나)
// - 담당자는 현재 참여자만, 담당자가 부재면 책임자·관리자만 바꿀 수 있다 (서버도 403).
// - 상태 선택은 드래그가 어려운 경우를 위한 것이고, 바꾸면 그 컬럼 맨 아래로 간다.
export function TaskFormDialog(props: TaskFormDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={props.state !== null} onOpenChange={(next) => !next && !busy && props.onClose()}>
      {/* 에디터 도구 막대가 들어가도록 넓히고, 내용이 길면 창 안에서 스크롤 */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">{props.state && <TaskForm {...props} state={props.state} onBusyChange={setBusy} />}</DialogContent>
    </Dialog>
  );
}

function TaskForm({
  projectId,
  members,
  canManage,
  columnSize,
  state,
  onClose,
  onBusyChange,
}: TaskFormDialogProps & { state: NonNullable<TaskFormState>; onBusyChange: (busy: boolean) => void }) {
  const editing = state.mode === "edit" ? state.task : null;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [status, setStatus] = useState<ProjectTaskStatus>(editing?.status ?? (state.mode === "create" ? state.status : "TODO"));
  const [assigneeId, setAssigneeId] = useState(editing?.assigneeId ? String(editing.assigneeId) : NO_ASSIGNEE);
  const [dueDate, setDueDate] = useState(toDateInputValue(editing?.dueDate));
  const [titleError, setTitleError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 지금 담당자가 부재면 일반 참여자는 담당자를 바꿀 수 없다
  const assigneeLocked = !!editing?.assigneeAbsent && !canManage;
  // 부재 담당자는 참여자 목록에 없으므로 선택지에 따로 넣어 현재 값을 보여 준다
  const absentAssignee = editing?.assigneeAbsent && editing.assignee ? editing.assignee : null;
  const assignable = members.filter((m) => !m.user.deleted && m.user.status !== "RESIGNED");

  const create = useProjectMutation((input: ProjectTaskInput) => createProjectTask(projectId, input));
  const update = useProjectMutation(({ id, input }: { id: number; input: Partial<ProjectTaskInput> }) => updateProjectTask(projectId, id, input));
  const move = useProjectMutation(({ id, to }: { id: number; to: ProjectTaskStatus }) =>
    moveProjectTask(projectId, id, { status: to, index: columnSize(to) }),
  );
  const remove = useProjectMutation((id: number) => deleteProjectTask(projectId, id));
  const pending = create.isPending || update.isPending || move.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!title.trim()) return setTitleError("제목을 입력해 주세요.");
    if (title.trim().length > 200) return setTitleError("제목은 200자 이하로 입력해 주세요.");
    setTitleError(undefined);
    setServerError(null);
    onBusyChange(true);

    const nextAssignee = assigneeId === NO_ASSIGNEE ? null : Number(assigneeId);
    try {
      if (editing) {
        const input: Partial<ProjectTaskInput> = {
          title: title.trim(),
          description: description || null, // 에디터 HTML (빈 본문이면 "")
          dueDate: dueDate || null,
          // 담당자는 바뀐 경우에만 보낸다 (부재 담당 과제를 일반 참여자가 저장해도 403이 나지 않게)
          ...(nextAssignee !== editing.assigneeId && { assigneeId: nextAssignee }),
        };
        await update.mutateAsync({ id: editing.id, input });
        if (status !== editing.status) await move.mutateAsync({ id: editing.id, to: status });
        toast.success("과제를 저장했습니다.");
      } else {
        await create.mutateAsync({
          title: title.trim(),
          description: description || null, // 에디터 HTML (빈 본문이면 "")
          status,
          assigneeId: nextAssignee,
          dueDate: dueDate || null,
        });
        toast.success("과제를 만들었습니다.");
      }
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      onBusyChange(false);
    }
  };

  const runDelete = async () => {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.id);
      toast.success("과제를 삭제했습니다.");
      setConfirmDelete(false);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "과제" : "새 과제"}</DialogTitle>
        <DialogDescription>{editing ? "과제 내용을 보고 수정합니다." : `${TASK_STATUS_LABEL[status]} 컬럼 맨 아래에 추가됩니다.`}</DialogDescription>
      </DialogHeader>

      <FormError message={serverError} />

      <FormField id="task-title" label="제목" required error={titleError}>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          aria-invalid={!!titleError}
          aria-describedby="task-title-message"
          autoFocus={!editing}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="task-status" label="상태">
          <Select value={status} onValueChange={(v) => setStatus(v as ProjectTaskStatus)}>
            <SelectTrigger id="task-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {TASK_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField id="task-due" label="마감일">
          <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
      </div>

      <FormField
        id="task-assignee"
        label="담당자"
        hint={
          assigneeLocked
            ? "담당자가 부재인 과제는 책임자만 담당자를 바꿀 수 있습니다."
            : absentAssignee
              ? "담당자가 프로젝트에서 빠졌거나 퇴사했습니다. 인수인계할 사람을 지정해 주세요."
              : undefined
        }
      >
        <Select value={assigneeId} onValueChange={setAssigneeId} disabled={assigneeLocked}>
          <SelectTrigger id="task-assignee" className="w-full" aria-describedby="task-assignee-message">
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ASSIGNEE}>담당자 없음</SelectItem>
            {absentAssignee && (
              <SelectItem value={String(absentAssignee.id)} disabled>
                {absentAssignee.name} (부재)
              </SelectItem>
            )}
            {assignable.map((m) => (
              <SelectItem key={m.user.id} value={String(m.user.id)}>
                {m.user.name}
                {m.user.position ? ` ${m.user.position.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-1.5">
        <Label id="task-description-label">내용</Label>
        {/* 공용 에디터 (본문 이미지 없음 - 서버도 저장 시 이미지를 지운다) */}
        <RichTextEditor
          id="task-description"
          labelledBy="task-description-label"
          initialContent={editing?.description ?? ""}
          allowImages={false}
          onChange={(html, isEmpty) => setDescription(isEmpty ? "" : html)}
        />
      </div>

      <DialogFooter className="sm:justify-between">
        {editing ? (
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={pending}>
            <Trash2 aria-hidden />
            삭제
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {editing ? "저장" : "만들기"}
          </Button>
        </div>
      </DialogFooter>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="과제를 삭제할까요?"
        description="삭제한 과제는 칸반과 진척도에서 빠집니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={runDelete}
      />
    </form>
  );
}
