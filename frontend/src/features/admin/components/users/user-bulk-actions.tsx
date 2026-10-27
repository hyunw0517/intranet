"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import {
  bulkDeleteUsers,
  bulkUpdateUsers,
  type AdminUserListItem,
  type BulkUpdateUsersInput,
} from "@/services/api/users";
import { ROLE_LABEL, STATUS_LABEL } from "@/types/user";
import { useAdminUserMutation } from "../../hooks/use-admin-users";

const KEEP = "keep"; // "변경 안 함" (Select는 빈 문자열 값을 쓸 수 없다)

interface Props {
  selectedUsers: AdminUserListItem[];
  onDone: () => void; // 성공 후 선택 해제
}

// 회원 목록 하단의 선택 회원 일괄 처리 [삭제] [권한·상태]
// ⚠ 백엔드 일괄 API는 아직 없다. (services/api/users.ts의 제안 계약 참고) 구현 전에는 요청이 실패해 오류가 표시된다.
export function UserBulkActions({ selectedUsers, onDone }: Props) {
  const [dialog, setDialog] = useState<"delete" | "update" | null>(null);
  const count = selectedUsers.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {count}명 선택
      </span>
      <Button variant="outline" size="sm" disabled={count === 0} onClick={() => setDialog("update")}>
        권한·상태
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={count === 0}
        onClick={() => setDialog("delete")}
      >
        삭제
      </Button>

      <BulkDeleteDialog
        open={dialog === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
        users={selectedUsers}
        onDone={onDone}
      />
      <BulkUpdateDialog
        open={dialog === "update"}
        onOpenChange={(open) => !open && setDialog(null)}
        users={selectedUsers}
        onDone={onDone}
      />
    </div>
  );
}

// "홍길동, 김철수, 이영희 외 2명"
function namesLabel(users: AdminUserListItem[], max = 3) {
  const names = users.slice(0, max).map((u) => u.name).join(", ");
  return users.length > max ? `${names} 외 ${users.length - max}명` : names;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: AdminUserListItem[];
  onDone: () => void;
}

function BulkDeleteDialog({ open, onOpenChange, users, onDone }: DialogProps) {
  const mutation = useAdminUserMutation((ids: number[]) => bulkDeleteUsers(ids));

  const handleConfirm = () =>
    mutation.mutate(
      users.map((u) => u.id),
      {
        onSuccess: () => {
          toast.success(`${users.length}명을 삭제했습니다.`);
          onOpenChange(false);
          onDone();
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`회원 ${users.length}명 삭제`}
      description={`${namesLabel(users)} 회원을 삭제합니다. 삭제된 회원은 로그인할 수 없으며 [삭제된 회원]에서 복구할 수 있습니다.`}
      confirmLabel="삭제"
      destructive
      pending={mutation.isPending}
      onConfirm={handleConfirm}
    />
  );
}

function BulkUpdateDialog({ open, onOpenChange, users, onDone }: DialogProps) {
  const mutation = useAdminUserMutation((input: BulkUpdateUsersInput) => bulkUpdateUsers(input));

  // 요청 중에는 닫지 않고, 닫을 때 이전 오류를 지운다. (다시 열었을 때 남아 있지 않도록)
  const handleOpenChange = (next: boolean) => {
    if (mutation.isPending) return;
    if (!next) mutation.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>권한·상태 일괄 변경</DialogTitle>
          <DialogDescription>{namesLabel(users)} 회원에게 같은 값을 적용합니다.</DialogDescription>
        </DialogHeader>
        {/* 열 때마다 입력값을 초기화하도록 열려 있을 때만 그린다. */}
        {open && (
          <BulkUpdateForm
            users={users}
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={() => handleOpenChange(false)}
            onSubmit={(input) =>
              mutation.mutate(input, {
                onSuccess: () => {
                  toast.success(`${users.length}명의 권한·상태를 변경했습니다.`);
                  onOpenChange(false);
                  onDone();
                },
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkUpdateForm({
  users,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  users: AdminUserListItem[];
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSubmit: (input: BulkUpdateUsersInput) => void;
}) {
  const [role, setRole] = useState<string>(KEEP);
  const [status, setStatus] = useState<string>(KEEP);
  const [joinAt, setJoinAt] = useState("");
  const [formError, setFormError] = useState<string>();

  // 승인 대기 회원을 승인하는 경우에만 입사일 입력을 보여 준다.
  const hasGuest = users.some((u) => u.role === "GUEST");
  const showJoinAt = hasGuest && role !== KEEP;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (role === KEEP && status === KEEP) {
      setFormError("변경할 권한 또는 상태를 선택하세요.");
      return;
    }
    setFormError(undefined);
    onSubmit({
      ids: users.map((u) => u.id),
      role: role === KEEP ? undefined : (role as BulkUpdateUsersInput["role"]),
      status: status === KEEP ? undefined : (status as BulkUpdateUsersInput["status"]),
      joinAt: showJoinAt && joinAt ? joinAt : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <FormError message={formError ?? (error ? getErrorMessage(error) : null)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="bulk-role" label="권한">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="bulk-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>변경 안 함</SelectItem>
              {(["USER", "ADMIN"] as const).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="bulk-status" label="상태">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="bulk-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KEEP}>변경 안 함</SelectItem>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {showJoinAt && (
        <FormField
          id="bulk-joinAt"
          label="입사일"
          hint="선택한 회원 중 승인 대기 회원이 있습니다. 입사일이 없는 회원을 승인하려면 입력하세요."
        >
          <Input
            id="bulk-joinAt"
            type="date"
            value={joinAt}
            onChange={(e) => setJoinAt(e.target.value)}
            aria-describedby="bulk-joinAt-message"
          />
        </FormField>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          변경
        </Button>
      </DialogFooter>
    </form>
  );
}
