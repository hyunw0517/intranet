"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormError, FormField } from "@/components/common/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import {
  createUserDepartment,
  deleteUserDepartment,
  setPrimaryUserDepartment,
  updateUserDepartment,
  updateUserPosition,
  type UserDepartmentInput,
} from "@/services/api/organization";
import type { AdminUserDetail } from "@/services/api/users";
import type { UserDepartmentItem } from "@/types/organization";
import { useAdminUserMutation } from "../../hooks/use-admin-users";
import { useDepartments, useJobTitles, usePositions } from "../../hooks/use-organization";

const NONE = "none"; // Select는 빈 문자열 값을 쓸 수 없어 "없음"을 별도 값으로 둔다.

export function UserOrganizationSection({ user }: { user: AdminUserDetail }) {
  return (
    <div className="grid gap-6">
      <PositionForm key={user.position?.id ?? NONE} user={user} />
      <DepartmentList user={user} />
    </div>
  );
}

// 직급 지정 (없음 = 해제)
function PositionForm({ user }: { user: AdminUserDetail }) {
  const { data: positions = [], isPending } = usePositions();
  const current = user.position ? String(user.position.id) : NONE;
  const [value, setValue] = useState(current);
  const mutation = useAdminUserMutation((positionId: number | null) => updateUserPosition(user.id, positionId));

  const handleSave = () =>
    mutation.mutate(value === NONE ? null : Number(value), {
      onSuccess: () => toast.success("직급을 변경했습니다."),
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  return (
    <FormField id="user-position" label="직급">
      <div className="flex gap-2">
        <Select value={value} onValueChange={setValue} disabled={isPending}>
          <SelectTrigger id="user-position" className="w-40">
            <SelectValue placeholder="불러오는 중" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>없음</SelectItem>
            {positions.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleSave} disabled={value === current || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          변경
        </Button>
      </div>
    </FormField>
  );
}

type DialogState = { mode: "add" } | { mode: "edit"; item: UserDepartmentItem } | null;

// 소속 목록 (대표 소속이 맨 위) + 추가·수정·대표 지정·삭제
function DepartmentList({ user }: { user: AdminUserDetail }) {
  const { data: departments = [] } = useDepartments();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserDepartmentItem | null>(null);

  const primaryMutation = useAdminUserMutation((id: number) => setPrimaryUserDepartment(user.id, id));
  const deleteMutation = useAdminUserMutation((id: number) => deleteUserDepartment(user.id, id));

  // 같은 이름의 부서가 다른 상위 부서 아래에 있을 수 있으므로 경로(상위/하위)로 표시한다.
  const pathOf = (item: UserDepartmentItem) =>
    departments.find((d) => d.id === item.department.id)?.path ?? item.department.name;

  const handlePrimary = (item: UserDepartmentItem) =>
    primaryMutation.mutate(item.id, {
      onSuccess: () => toast.success(`${pathOf(item)}을(를) 대표 소속으로 지정했습니다.`),
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("소속을 삭제했습니다.");
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">소속</span>
        <Button variant="outline" size="sm" onClick={() => setDialog({ mode: "add" })}>
          <Plus aria-hidden />
          소속 추가
        </Button>
      </div>

      {user.departments.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground">
          소속이 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {user.departments.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{pathOf(item)}</span>
                <span className="text-muted-foreground">{item.jobTitle?.name ?? "직책 없음"}</span>
                {item.isPrimary && <Badge variant="secondary">대표</Badge>}
              </div>
              <div className="flex shrink-0 gap-1">
                {!item.isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => handlePrimary(item)} disabled={primaryMutation.isPending}>
                    대표로 지정
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", item })}>
                  수정
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(item)}>
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <UserDepartmentDialog user={user} state={dialog} onClose={() => setDialog(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="소속 삭제"
        description={
          deleteTarget?.isPrimary
            ? "대표 소속을 삭제하면 남은 소속 중 가장 먼저 등록된 소속이 대표가 됩니다."
            : "이 소속을 삭제합니다."
        }
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// 소속 추가·수정 모달 (부서 + 직책)
function UserDepartmentDialog({ user, state, onClose }: { user: AdminUserDetail; state: DialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* 열릴 때마다 새로 마운트해 이전 입력값이 남지 않게 한다. */}
        {state && <UserDepartmentForm user={user} state={state} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function UserDepartmentForm({
  user,
  state,
  onClose,
}: {
  user: AdminUserDetail;
  state: NonNullable<DialogState>;
  onClose: () => void;
}) {
  const { data: departments = [] } = useDepartments();
  const { data: jobTitles = [] } = useJobTitles();
  const editing = state.mode === "edit" ? state.item : null;

  const [departmentId, setDepartmentId] = useState(editing ? String(editing.department.id) : "");
  const [jobTitleId, setJobTitleId] = useState(editing?.jobTitle ? String(editing.jobTitle.id) : NONE);
  const [departmentError, setDepartmentError] = useState<string>();

  const mutation = useAdminUserMutation((input: UserDepartmentInput) =>
    editing ? updateUserDepartment(user.id, editing.id, input) : createUserDepartment(user.id, input),
  );

  // 이미 소속된 부서는 고를 수 없다. (서버도 중복 소속을 거부) 수정 중인 소속의 부서는 그대로 둔다.
  const takenIds = new Set(user.departments.filter((d) => d.id !== editing?.id).map((d) => d.department.id));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!departmentId) {
      setDepartmentError("부서를 선택해 주세요.");
      return;
    }
    setDepartmentError(undefined);
    mutation.mutate(
      { departmentId: Number(departmentId), jobTitleId: jobTitleId === NONE ? null : Number(jobTitleId) },
      {
        onSuccess: () => {
          toast.success(editing ? "소속을 수정했습니다." : "소속을 추가했습니다.");
          onClose();
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "소속 수정" : "소속 추가"}</DialogTitle>
        <DialogDescription>{user.name} 회원의 소속 부서와 직책을 지정합니다.</DialogDescription>
      </DialogHeader>

      <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />

      <FormField id="ud-department" label="부서" required error={departmentError}>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger
            id="ud-department"
            className="w-full"
            aria-invalid={!!departmentError}
            aria-describedby="ud-department-message"
          >
            <SelectValue placeholder="부서 선택" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)} disabled={takenIds.has(d.id)}>
                {d.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField id="ud-jobTitle" label="직책">
        <Select value={jobTitleId} onValueChange={setJobTitleId}>
          <SelectTrigger id="ud-jobTitle" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>없음</SelectItem>
            {jobTitles.map((j) => (
              <SelectItem key={j.id} value={String(j.id)}>
                {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
          취소
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}
