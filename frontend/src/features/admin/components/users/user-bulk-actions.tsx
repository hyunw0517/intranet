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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import { isAdminRole } from "@/lib/admin-permission";
import { useAuth } from "@/providers/auth-provider";
import {
  bulkDeleteUsers,
  bulkUpdateUsersRole,
  bulkUpdateUsersStatus,
  type AdminUserListItem,
  type ApprovedRole,
} from "@/services/api/users";
import { ROLE_LABEL, STATUS_LABEL, type UserStatus } from "@/types/user";
import { useAdminUserMutation } from "../../hooks/use-admin-users";

type BulkDialog = "role" | "status" | "delete" | null;

interface Props {
  selectedUsers: AdminUserListItem[];
  onDone: () => void; // 성공 후 선택 해제
}

// 회원 목록 하단의 선택 회원 일괄 처리 [권한 변경] [상태 변경] [삭제]
// 요청 하나가 동작 하나다. (권한과 상태를 한 요청에 섞지 않아 일부만 반영되는 경우가 없다)
// 한 명이라도 처리할 수 없으면 서버가 전체를 거부하고(트랜잭션), 그 메시지를 모달에 보여 준다.
export function UserBulkActions({ selectedUsers, onDone }: Props) {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  // 관리자 계정이 섞여 있으면 슈퍼관리자만 처리할 수 있다. (서버도 전체 403)
  const hasAdminAccount = selectedUsers.some((u) => isAdminRole(u.role));
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const count = selectedUsers.length;
  const ids = selectedUsers.map((u) => u.id);
  const close = () => setDialog(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {count}명 선택
      </span>
      <Button variant="outline" size="sm" disabled={count === 0} onClick={() => setDialog("role")}>
        권한 변경
      </Button>
      <Button variant="outline" size="sm" disabled={count === 0} onClick={() => setDialog("status")}>
        상태 변경
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

      <BulkSelectDialog<ApprovedRole>
        open={dialog === "role"}
        onClose={close}
        title="권한 일괄 변경"
        description={`${namesLabel(selectedUsers)} 회원의 권한을 변경합니다.`}
        label="권한"
        // 관리자 지정은 슈퍼관리자만, 관리자 기능은 회원별로 ⋯ 메뉴에서 지정한다.
        options={((isSuperAdmin ? ["USER", "ADMIN", "SUPER_ADMIN"] : ["USER"]) as ApprovedRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        notice={[
          selectedUsers.some((u) => u.role === "GUEST")
            ? "승인 대기 회원은 입사일이 등록되어 있어야 승인됩니다. 입사일이 없는 회원이 있으면 전체가 처리되지 않습니다."
            : null,
          isSuperAdmin ? "관리자로 바꾼 회원의 관리자 기능은 회원별 ⋯ 메뉴에서 지정합니다. (새 관리자는 기능 없이 시작)" : null,
          !isSuperAdmin && hasAdminAccount ? "관리자 계정이 포함되어 있어 처리할 수 없습니다. 관리자 계정은 슈퍼관리자만 변경합니다." : null,
        ].filter(Boolean).join(" ") || undefined}
        mutationFn={(role) => bulkUpdateUsersRole(ids, role)}
        successMessage={(role) => `${count}명의 권한을 ${ROLE_LABEL[role]}(으)로 변경했습니다.`}
        onDone={onDone}
      />
      <BulkSelectDialog<UserStatus>
        open={dialog === "status"}
        onClose={close}
        title="상태 일괄 변경"
        description={`${namesLabel(selectedUsers)} 회원의 상태를 변경합니다.`}
        label="상태"
        options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value: value as UserStatus, label }))}
        notice="재직이 아니면 해당 회원의 로그인과 모든 요청이 즉시 차단됩니다."
        mutationFn={(status) => bulkUpdateUsersStatus(ids, status)}
        successMessage={(status) => `${count}명의 상태를 ${STATUS_LABEL[status]}(으)로 변경했습니다.`}
        onDone={onDone}
      />
      <BulkDeleteDialog open={dialog === "delete"} onClose={close} users={selectedUsers} onDone={onDone} />
    </div>
  );
}

// "홍길동, 김철수, 이영희 외 2명"
function namesLabel(users: AdminUserListItem[], max = 3) {
  const names = users.slice(0, max).map((u) => u.name).join(", ");
  return users.length > max ? `${names} 외 ${users.length - max}명` : names;
}

// 권한·상태 일괄 변경 공용 모달 (값 하나를 골라 선택한 회원 모두에게 적용)
function BulkSelectDialog<T extends string>({
  open,
  onClose,
  title,
  description,
  label,
  options,
  notice,
  mutationFn,
  successMessage,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  label: string;
  options: { value: T; label: string }[];
  notice?: string;
  mutationFn: (value: T) => Promise<unknown>;
  successMessage: (value: T) => string;
  onDone: () => void;
}) {
  const [value, setValue] = useState<T | "">("");
  const mutation = useAdminUserMutation(mutationFn);

  // 요청 중에는 닫지 않고, 닫을 때 선택값·이전 오류를 지운다. (다시 열었을 때 남아 있지 않도록)
  const handleOpenChange = (next: boolean) => {
    if (next || mutation.isPending) return;
    setValue("");
    mutation.reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!value) return;
    mutation.mutate(value, {
      onSuccess: () => {
        toast.success(successMessage(value));
        handleOpenChange(false);
        onDone();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          {/* 입사일 없는 승인 대기 회원(이름 포함), 본인 포함 등 서버 검증 오류 */}
          <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />
          <FormField id="bulk-value" label={label} required hint={notice}>
            <Select value={value} onValueChange={(v) => setValue(v as T)}>
              <SelectTrigger id="bulk-value" className="w-full" aria-describedby={notice ? "bulk-value-message" : undefined}>
                <SelectValue placeholder={`변경할 ${label} 선택`} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
              취소
            </Button>
            <Button type="submit" disabled={!value || mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              변경
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteDialog({
  open,
  onClose,
  users,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  users: AdminUserListItem[];
  onDone: () => void;
}) {
  const mutation = useAdminUserMutation((ids: number[]) => bulkDeleteUsers(ids));

  const handleConfirm = () =>
    mutation.mutate(
      users.map((u) => u.id),
      {
        onSuccess: () => {
          toast.success(`${users.length}명을 삭제했습니다.`);
          onClose();
          onDone();
        },
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`회원 ${users.length}명 삭제`}
      description={`${namesLabel(users)} 회원을 삭제합니다. 삭제된 회원은 로그인할 수 없으며 [삭제된 회원]에서 복구할 수 있습니다.`}
      confirmLabel="삭제"
      destructive
      pending={mutation.isPending}
      onConfirm={handleConfirm}
    />
  );
}
