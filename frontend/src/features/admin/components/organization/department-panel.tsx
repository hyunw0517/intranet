"use client";

import { useState } from "react";
import { CornerDownRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import {
  createDepartment,
  deleteDepartment,
  updateDepartment,
  type DepartmentInput,
} from "@/services/api/departments";
import type { Department } from "@/types/organization";
import { useDepartments, useOrganizationMutation } from "../../hooks/use-organization";
import { NameDialog } from "./name-dialog";

const ROOT = "root"; // 상위 부서 없음(최상위). Select는 빈 문자열 값을 쓸 수 없어 별도 값으로 둔다.

type DialogState =
  | { mode: "add"; parentId: number | null }
  | { mode: "edit"; department: Department }
  | null;

// 자기 자신과 하위 부서 id
// 서버 응답이 트리 순서(전위 순회)이므로, 자기 바로 뒤에서 depth가 더 깊은 항목이 이어지는 동안이 하위 부서다.
function selfAndDescendantIds(list: Department[], target: Department) {
  const ids = new Set([target.id]);
  const start = list.findIndex((d) => d.id === target.id);
  for (let i = start + 1; i < list.length && list[i].depth > target.depth; i++) ids.add(list[i].id);
  return ids;
}

// 부서 관리: 트리 순서 목록 + 추가(최상위·하위)·수정(이름·상위 부서 이동)·삭제
export function DepartmentPanel() {
  const { data: departments, isPending, isError, error, refetch } = useDepartments();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [parentValue, setParentValue] = useState(ROOT);

  const saveMutation = useOrganizationMutation((input: DepartmentInput) =>
    dialog?.mode === "edit" ? updateDepartment(dialog.department.id, input) : createDepartment(input),
  );
  const deleteMutation = useOrganizationMutation((id: number) => deleteDepartment(id));

  const openDialog = (next: NonNullable<DialogState>) => {
    const parentId = next.mode === "add" ? next.parentId : next.department.parentDepartmentId;
    setParentValue(parentId === null ? ROOT : String(parentId));
    saveMutation.reset();
    setDialog(next);
  };

  const handleSave = (name: string) =>
    saveMutation.mutate(
      { name, parentDepartmentId: parentValue === ROOT ? null : Number(parentValue) },
      {
        onSuccess: () => {
          toast.success(dialog?.mode === "edit" ? "부서를 수정했습니다." : "부서를 추가했습니다.");
          setDialog(null);
        },
      },
    );

  // 하위 부서·소속 인원이 있으면 서버가 400으로 거부하고, 그 메시지를 그대로 보여 준다.
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.name} 부서를 삭제했습니다.`);
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err));
        setDeleteTarget(null);
      },
    });
  };

  // 상위 부서 후보: 수정 중이면 자기 자신과 하위 부서는 제외 (순환 참조 방지, 최종 검사는 서버)
  const excluded =
    dialog?.mode === "edit" && departments ? selfAndDescendantIds(departments, dialog.department) : new Set<number>();
  const parentOptions = (departments ?? []).filter((d) => !excluded.has(d.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">상위 부서 아래에 하위 부서를 두는 트리 구조입니다.</p>
        <Button onClick={() => openDialog({ mode: "add", parentId: null })} className="shrink-0 self-start sm:self-auto">
          <Plus aria-hidden />
          부서 추가
        </Button>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : departments.length === 0 ? (
        <EmptyState message="등록된 부서가 없습니다." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {departments.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              {/* 깊이만큼 들여쓰기 (모바일에서 너무 밀리지 않게 단계당 1rem) */}
              <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${d.depth}rem` }}>
                {d.depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={d.depth === 0 ? "font-semibold" : "font-medium"}>{d.name}</span>
                <span className="sr-only">({d.path})</span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "add", parentId: d.id })}>
                  하위 추가
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "edit", department: d })}>
                  수정
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(d)}>
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <NameDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.mode === "edit" ? "부서 수정" : "부서 추가"}
        description={
          dialog?.mode === "edit"
            ? "부서 이름을 바꾸거나 다른 상위 부서 아래로 옮깁니다."
            : "같은 상위 부서 안에서는 이름이 겹칠 수 없습니다."
        }
        label="부서명"
        initialName={dialog?.mode === "edit" ? dialog.department.name : ""}
        submitLabel={dialog?.mode === "edit" ? "저장" : "추가"}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        onSubmit={handleSave}
      >
        <FormField id="department-parent" label="상위 부서">
          <Select value={parentValue} onValueChange={setParentValue}>
            <SelectTrigger id="department-parent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ROOT}>없음 (최상위 부서)</SelectItem>
              {parentOptions.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </NameDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="부서 삭제"
        description={`${deleteTarget?.path ?? ""} 부서를 삭제합니다. 하위 부서나 소속 인원이 있으면 삭제할 수 없습니다.`}
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
