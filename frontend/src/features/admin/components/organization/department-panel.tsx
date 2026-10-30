"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  reorderDepartments,
  updateDepartment,
  type DepartmentInput,
} from "@/services/api/departments";
import type { Department } from "@/types/organization";
import { organizationKeys, useDepartments, useOrganizationMutation } from "../../hooks/use-organization";
import { NameDialog } from "./name-dialog";
import { groupByParent, SortableList, SortSaveBar, useGroupedSortDrafts } from "./sortable-list";

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

type DepartmentSortDrafts = ReturnType<typeof useGroupedSortDrafts<Department>>;

// 부서 관리: 트리 목록 + 추가(최상위·하위)·수정(이름·상위 부서 이동)·삭제 + 같은 상위 부서 안에서 드래그 정렬
export function DepartmentPanel() {
  const queryClient = useQueryClient();
  const { data: departments, isPending, isError, error, refetch } = useDepartments();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [parentValue, setParentValue] = useState(ROOT);
  const sort = useGroupedSortDrafts(groupByParent(departments ?? [], (d) => d.parentDepartmentId));

  const saveMutation = useOrganizationMutation((input: DepartmentInput) =>
    dialog?.mode === "edit" ? updateDepartment(dialog.department.id, input) : createDepartment(input),
  );
  const deleteMutation = useOrganizationMutation((id: number) => deleteDepartment(id));
  // 바뀐 형제 그룹마다 순서 변경 요청 (그룹 하나가 요청 하나이며, 각 요청은 서버에서 트랜잭션으로 처리)
  const orderMutation = useOrganizationMutation(async (groups: { parentId: number | null; ids: number[] }[]) => {
    for (const group of groups) await reorderDepartments(group.parentId, group.ids);
  });

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

  const handleSaveOrder = () =>
    orderMutation.mutate(sort.changedGroups, {
      onSuccess: () => {
        toast.success("부서 순서를 저장했습니다.");
        sort.reset();
      },
      // 여러 그룹 중 일부만 저장됐을 수 있으므로 최신 목록으로 다시 맞춘다.
      onError: (err) => {
        toast.error(getErrorMessage(err));
        sort.reset();
        queryClient.invalidateQueries({ queryKey: organizationKeys.departments() });
      },
    });

  // 상위 부서 후보: 수정 중이면 자기 자신과 하위 부서는 제외 (순환 참조 방지, 최종 검사는 서버)
  const excluded =
    dialog?.mode === "edit" && departments ? selfAndDescendantIds(departments, dialog.department) : new Set<number>();
  const parentOptions = (departments ?? []).filter((d) => !excluded.has(d.id));

  const renderActions = (d: Department) => (
    <>
      <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "add", parentId: d.id })}>
        하위 추가
      </Button>
      <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "edit", department: d })}>
        수정
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(d)}>
        삭제
      </Button>
    </>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          상위 부서 아래에 하위 부서를 두는 트리 구조입니다. 순서는 같은 상위 부서 안에서만 바꿀 수 있습니다.
        </p>
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
        <>
          <SortSaveBar
            visible={sort.changedGroups.length > 0}
            pending={orderMutation.isPending}
            onCancel={sort.reset}
            onSave={handleSaveOrder}
          />
          {/* 행마다 위 테두리를 두고, 첫 행의 테두리는 바깥 테두리 밑으로 숨긴다(-mt-px). 중첩 목록이라 divide-y를 쓸 수 없다. */}
          <div className="overflow-hidden rounded-lg border">
            <DepartmentGroup parentId={null} className="-mt-px" sort={sort} renderActions={renderActions} />
          </div>
        </>
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

// 한 상위 부서 아래의 형제 부서 목록 (각 부서 안에 자기 하위 부서 목록을 다시 그린다)
// 형제 그룹마다 별도의 정렬 목록이라 다른 상위 부서 아래로는 끌어다 놓을 수 없다. (상위 부서 이동은 [수정]에서)
// 부서를 끌면 그 안에 그려진 하위 부서들도 함께 움직인다.
function DepartmentGroup({
  parentId,
  className,
  sort,
  renderActions,
}: {
  parentId: number | null;
  className?: string;
  sort: DepartmentSortDrafts;
  renderActions: (department: Department) => React.ReactNode;
}) {
  const siblings = sort.ordered(parentId);
  if (siblings.length === 0) return null;

  return (
    <SortableList
      items={siblings}
      onReorder={(ids) => sort.setDraft(parentId, ids)}
      className={className}
      renderItem={(d, handle) => (
        <>
          <div className="flex flex-col gap-2 border-t py-2 pr-4 pl-2 sm:flex-row sm:items-center sm:justify-between">
            {/* 깊이만큼 들여쓰기 (모바일에서 너무 밀리지 않게 단계당 1rem) */}
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${d.depth}rem` }}>
              {handle}
              {d.depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className={d.depth === 0 ? "font-semibold" : "font-medium"}>{d.name}</span>
              <span className="sr-only">({d.path})</span>
            </div>
            <div className="flex shrink-0 gap-1">{renderActions(d)}</div>
          </div>
          <DepartmentGroup parentId={d.id} sort={sort} renderActions={renderActions} />
        </>
      )}
    />
  );
}
