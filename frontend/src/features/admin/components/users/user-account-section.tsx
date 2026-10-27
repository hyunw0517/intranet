"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { InfoItem } from "@/components/common/section";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { updateUserRole, updateUserStatus, type AdminUserDetail, type ApprovedRole } from "@/services/api/users";
import { ROLE_LABEL, STATUS_LABEL, type UserStatus } from "@/types/user";
import { useAdminUserMutation } from "../../hooks/use-admin-users";
import { RoleBadge, StatusBadge } from "./user-badges";

const APPROVED_ROLES: ApprovedRole[] = ["USER", "ADMIN"]; // GUEST로 되돌리기는 서버가 막는다.

interface Props {
  user: AdminUserDetail;
  isSelf: boolean;
}

export function UserAccountSection({ user, isSelf }: Props) {
  return (
    <div className="grid gap-6">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="권한" value={<RoleBadge role={user.role} />} />
        <InfoItem label="상태" value={<StatusBadge status={user.status} />} />
        <InfoItem label="입사일" value={formatDate(user.joinAt)} />
        <InfoItem label="가입일" value={formatDate(user.createdAt)} />
      </dl>

      {isSelf ? (
        <p className="rounded-md border bg-muted/50 px-4 py-3 text-muted-foreground">
          본인 계정의 권한·상태는 변경할 수 없습니다.
        </p>
      ) : (
        <>
          {/* key: 저장 후 서버 값이 바뀌면 입력 상태를 새로 맞춘다. */}
          {user.role === "GUEST" ? (
            <ApproveForm user={user} />
          ) : (
            <RoleForm key={user.role} user={user} />
          )}
          <StatusForm key={user.status} user={user} />
        </>
      )}
    </div>
  );
}

// 가입 승인: GUEST → USER/ADMIN
// 입사일(연차 계산에 필요)이 먼저 등록되어 있어야 승인할 수 있다. 입사일은 회원 상세의 기본 정보에서 등록한다. (서버도 400으로 검사)
function ApproveForm({ user }: { user: AdminUserDetail }) {
  const [role, setRole] = useState<ApprovedRole>("USER");
  const mutation = useAdminUserMutation((next: ApprovedRole) => updateUserRole(user.id, next));
  const hasJoinAt = !!user.joinAt;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutation.mutate(role, { onSuccess: () => toast.success(`${user.name} 회원의 가입을 승인했습니다.`) });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg border p-4" noValidate>
      <div>
        <h3 className="font-medium">가입 승인</h3>
        <p className="mt-1 text-sm text-muted-foreground">승인하면 인트라넷의 모든 직원 메뉴를 이용할 수 있습니다.</p>
      </div>
      {hasJoinAt ? (
        <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />
      ) : (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
          입사일이 등록되지 않아 승인할 수 없습니다.{" "}
          <Link href={`/admin/users/${user.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            회원 상세
          </Link>
          의 기본 정보에서 입사일을 먼저 등록하세요.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <FormField id="approve-role" label="권한" required>
          <Select value={role} onValueChange={(v) => setRole(v as ApprovedRole)} disabled={!hasJoinAt}>
            <SelectTrigger id="approve-role" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APPROVED_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <Button type="submit" disabled={!hasJoinAt || mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
          가입 승인
        </Button>
      </div>
    </form>
  );
}

function RoleForm({ user }: { user: AdminUserDetail }) {
  const [role, setRole] = useState<ApprovedRole>(user.role === "ADMIN" ? "ADMIN" : "USER");
  const mutation = useAdminUserMutation((next: ApprovedRole) => updateUserRole(user.id, next));

  const handleSave = () =>
    mutation.mutate(role, {
      onSuccess: () => toast.success(`권한을 ${ROLE_LABEL[role]}(으)로 변경했습니다.`),
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  return (
    <InlineSelectRow
      id="user-role"
      label="권한"
      value={role}
      options={APPROVED_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
      onValueChange={(v) => setRole(v as ApprovedRole)}
      changed={role !== user.role}
      pending={mutation.isPending}
      onSave={handleSave}
    />
  );
}

// 재직이 아닌 상태로 바꾸면 해당 회원의 다음 요청부터 바로 차단된다. (가드가 요청마다 상태 확인)
function StatusForm({ user }: { user: AdminUserDetail }) {
  const [status, setStatus] = useState<UserStatus>(user.status);
  const mutation = useAdminUserMutation((next: UserStatus) => updateUserStatus(user.id, next));

  const handleSave = () =>
    mutation.mutate(status, {
      onSuccess: () => toast.success(`상태를 ${STATUS_LABEL[status]}(으)로 변경했습니다.`),
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  return (
    <InlineSelectRow
      id="user-status"
      label="상태"
      hint="재직이 아니면 로그인과 모든 요청이 즉시 차단됩니다."
      value={status}
      options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
      onValueChange={(v) => setStatus(v as UserStatus)}
      changed={status !== user.status}
      pending={mutation.isPending}
      onSave={handleSave}
    />
  );
}

// 라벨 + 선택 + [변경] 한 줄 (값이 바뀌었을 때만 [변경] 활성화)
function InlineSelectRow({
  id,
  label,
  hint,
  value,
  options,
  onValueChange,
  changed,
  pending,
  onSave,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  changed: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <FormField id={id} label={label} hint={hint}>
      <div className="flex gap-2">
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger id={id} className="w-40" aria-describedby={hint ? `${id}-message` : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onSave} disabled={!changed || pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          변경
        </Button>
      </div>
    </FormField>
  );
}
