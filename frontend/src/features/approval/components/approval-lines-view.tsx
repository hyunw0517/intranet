"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import { createApprovalLine, deleteApprovalLine, updateApprovalLine } from "@/services/api/approval-lines";
import { LINE_SCOPE_LABEL, type ApprovalLine, type ApprovalLineScope, type LineManageScope } from "@/types/approval";
import { LINE_NAME_MAX } from "../approval-rules";
import { useApprovalMutation, useManageableLines, useMyLineScope, useUsableLines } from "../hooks/use-approvals";
import { ApprovalLineEditor, type LineApprover } from "./approval-line-editor";

type DialogState = { mode: "create"; scope: ApprovalLineScope } | { mode: "edit"; line: ApprovalLine } | null;

// 결재라인 화면
// - 내 결재라인: 개인(PERSONAL) 템플릿은 본인이 만들고 관리한다.
// - 공용·부서 결재라인: 결재라인 관리자(ADMIN 또는 ADMIN이 지정한 사람)에게만 보인다. (GET /approvals/line-managers/me)
export function ApprovalLinesView() {
  const usable = useUsableLines();
  const scope = useMyLineScope();
  const canManage = !!scope.data && (scope.data.all || scope.data.departmentIds.length > 0);
  const manageable = useManageableLines(canManage);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<ApprovalLine | null>(null);
  const remove = useApprovalMutation((id: number) => deleteApprovalLine(id));

  const personal = usable.data?.filter((l) => l.scope === "PERSONAL") ?? [];

  return (
    <div className="grid gap-10">
      <section aria-labelledby="my-lines-title" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="my-lines-title" className="font-semibold">
              내 결재라인
            </h2>
            <p className="text-sm text-muted-foreground">자주 쓰는 결재선을 저장해 두고 문서 작성 때 불러옵니다.</p>
          </div>
          <Button size="sm" onClick={() => setDialog({ mode: "create", scope: "PERSONAL" })}>
            <Plus aria-hidden />
            결재라인 추가
          </Button>
        </div>
        {usable.isPending ? (
          <LoadingState />
        ) : usable.isError ? (
          <ErrorState error={usable.error} onRetry={() => usable.refetch()} />
        ) : personal.length === 0 ? (
          <EmptyState message="저장한 결재라인이 없습니다." />
        ) : (
          <LineList lines={personal} onEdit={(line) => setDialog({ mode: "edit", line })} onDelete={setDeleting} />
        )}
      </section>

      {canManage && (
        <section aria-labelledby="manage-lines-title" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="manage-lines-title" className="font-semibold">
                공용·부서 결재라인 관리
              </h2>
              <p className="text-sm text-muted-foreground">
                {scope.data!.all
                  ? "공용 결재라인은 모든 직원이, 부서 결재라인은 그 부서 소속 직원이 불러옵니다."
                  : `맡은 부서(${scope.data!.departments.map((d) => d.name).join(", ")})의 부서 결재라인을 관리합니다.`}
              </p>
            </div>
            <div className="flex gap-2">
              {scope.data!.all && (
                <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "create", scope: "ADMIN" })}>
                  <Plus aria-hidden />
                  공용
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setDialog({ mode: "create", scope: "DEPARTMENT" })}>
                <Plus aria-hidden />
                부서
              </Button>
            </div>
          </div>
          {manageable.isPending ? (
            <LoadingState />
          ) : manageable.isError ? (
            <ErrorState error={manageable.error} onRetry={() => manageable.refetch()} />
          ) : manageable.data.lines.length === 0 ? (
            <EmptyState message="관리하는 결재라인이 없습니다." />
          ) : (
            <LineList lines={manageable.data.lines} showScope onEdit={(line) => setDialog({ mode: "edit", line })} onDelete={setDeleting} />
          )}
        </section>
      )}

      {dialog && scope.data && <LineFormDialog key={dialogKey(dialog)} state={dialog} scope={scope.data} onClose={() => setDialog(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="결재라인을 삭제할까요?"
        description={`'${deleting?.name ?? ""}'을(를) 삭제합니다. 이미 상신한 문서에는 영향이 없습니다.`}
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success("삭제했습니다.");
              setDeleting(null);
            },
            onError: (e) => toast.error(getErrorMessage(e)),
          })
        }
      />
    </div>
  );
}

function dialogKey(state: NonNullable<DialogState>) {
  return state.mode === "edit" ? `edit-${state.line.id}` : `create-${state.scope}`;
}

function LineList({
  lines,
  showScope = false,
  onEdit,
  onDelete,
}: {
  lines: ApprovalLine[];
  showScope?: boolean;
  onEdit: (line: ApprovalLine) => void;
  onDelete: (line: ApprovalLine) => void;
}) {
  return (
    <ul className="divide-y rounded-lg border">
      {lines.map((line) => {
        const unusable = line.steps.filter((s) => !s.usable).length;
        return (
          <li key={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <div className="grid min-w-0 flex-1 basis-60 gap-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {showScope && (
                  <span className="text-xs font-normal text-muted-foreground">
                    [{LINE_SCOPE_LABEL[line.scope]}
                    {line.department && ` · ${line.department.name}${line.department.deleted ? "(삭제된 부서)" : ""}`}]
                  </span>
                )}
                {line.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {line.steps.map((s, i) => (
                  <span key={s.stepOrder} className={s.usable ? undefined : "line-through"}>
                    {i > 0 && " → "}
                    {s.approverName ?? "(알 수 없음)"}
                    {s.name && ` (${s.name})`}
                  </span>
                ))}
              </p>
              {unusable > 0 && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  지정할 수 없는 결재자 {unusable}명 (불러올 때 빠집니다)
                </p>
              )}
            </div>
            <span className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" aria-label={`${line.name} 수정`} onClick={() => onEdit(line)}>
                <Pencil aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`${line.name} 삭제`} onClick={() => onDelete(line)}>
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// 결재라인 추가·수정 창 - 수정은 이름·단계만 (범위·부서는 바꿀 수 없다)
// 지정할 수 없게 된 결재자(퇴사 등)는 수정 화면에서 빼고 시작한다. (그대로 저장하면 서버가 400)
function LineFormDialog({ state, scope, onClose }: { state: NonNullable<DialogState>; scope: LineManageScope; onClose: () => void }) {
  const editing = state.mode === "edit" ? state.line : null;
  const lineScope = editing ? editing.scope : (state as { scope: ApprovalLineScope }).scope;

  const [name, setName] = useState(editing?.name ?? "");
  const [departmentId, setDepartmentId] = useState<string>(scope.departments.length === 1 ? String(scope.departments[0].id) : "");
  const [approvers, setApprovers] = useState<LineApprover[]>(
    editing?.steps
      .filter((s) => s.usable)
      .map((s) => ({
        approverId: s.approverId,
        name: s.approverName ?? "",
        departmentName: s.departmentName,
        positionName: s.positionName,
        jobTitleName: s.jobTitleName,
        stepName: s.name,
      })) ?? [],
  );
  const [errors, setErrors] = useState<{ name?: string; department?: string; approvers?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useApprovalMutation(() => {
    const input = {
      name: name.trim(),
      steps: approvers.map((a) => ({ approverId: a.approverId, name: a.stepName?.trim() || null })),
    };
    return editing
      ? updateApprovalLine(editing.id, input)
      : createApprovalLine({ ...input, scope: lineScope, ...(lineScope === "DEPARTMENT" && { departmentId: Number(departmentId) }) });
  });

  const submit = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "이름을 입력하세요.";
    if (!editing && lineScope === "DEPARTMENT" && !departmentId) next.department = "부서를 고르세요.";
    if (approvers.length === 0) next.approvers = "결재자를 1명 이상 지정하세요.";
    setErrors(next);
    if (next.name || next.department || next.approvers) return;

    setServerError(null);
    mutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(editing ? "수정했습니다." : "추가했습니다.");
        onClose();
      },
      onError: (e) => setServerError(getErrorMessage(e)),
    });
  };

  const title = `${LINE_SCOPE_LABEL[lineScope]} 결재라인 ${editing ? "수정" : "추가"}`;

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>위에서부터 순서대로 결재합니다. 문서 작성 때 불러온 뒤 고칠 수 있습니다.</DialogDescription>
        </DialogHeader>

        <form
          id="line-form"
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormError message={serverError} />
          <FormField id="line-name" label="이름" required error={errors.name}>
            <Input
              id="line-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LINE_NAME_MAX}
              placeholder="예: 팀장 → 본부장"
              aria-invalid={!!errors.name}
              className="h-9"
            />
          </FormField>

          {lineScope === "DEPARTMENT" &&
            (editing ? (
              <p className="text-sm text-muted-foreground">부서: {editing.department?.name ?? "-"} (바꿀 수 없음)</p>
            ) : (
              <FormField id="line-department" label="부서" required error={errors.department}>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger id="line-department" className="w-full" aria-invalid={!!errors.department}>
                    <SelectValue placeholder="부서 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {scope.departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ))}

          <div className="grid gap-2">
            <Label id="line-steps-label">
              결재자
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <ApprovalLineEditor value={approvers} onChange={setApprovers} withStepNames labelledBy="line-steps-label" />
            {errors.approvers && <p className="text-xs text-destructive">{errors.approvers}</p>}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button type="submit" form="line-form" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
