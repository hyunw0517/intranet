"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { InfoItem } from "@/components/common/section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isAdminRole } from "@/lib/admin-permission";
import { getErrorMessage } from "@/lib/error-message";
import { formatDate } from "@/lib/format";
import { updateUserRole, updateUserStatus, type AdminUserDetail, type ApprovedRole } from "@/services/api/users";
import { useAuth } from "@/providers/auth-provider";
import { ADMIN_PERMISSION_LABEL, ADMIN_PERMISSIONS, ROLE_LABEL, STATUS_LABEL, type AdminPermission, type UserStatus } from "@/types/user";
import { useAdminUserMutation } from "../../hooks/use-admin-users";
import { AdminPermissionsText, RoleBadge, StatusBadge } from "./user-badges";

// 고를 수 있는 권한 (GUEST로 되돌리기는 서버가 막는다)
// - 슈퍼관리자: 직원·관리자·슈퍼관리자 / 회원 관리 기능만 가진 관리자: 직원(가입 승인)만 (서버도 403)
function approvedRolesFor(isSuperAdmin: boolean): ApprovedRole[] {
  return isSuperAdmin ? ["USER", "ADMIN", "SUPER_ADMIN"] : ["USER"];
}

interface Props {
  user: AdminUserDetail;
  isSelf: boolean;
}

export function UserAccountSection({ user, isSelf }: Props) {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  // 관리자 계정(ADMIN·SUPER_ADMIN)의 권한·상태는 슈퍼관리자만 바꾼다. (서버 assertCanManageAccount)
  const lockedAdminAccount = isAdminRole(user.role) && !isSuperAdmin;

  return (
    <div className="grid gap-6">
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="권한" value={<RoleBadge role={user.role} />} />
        <InfoItem label="상태" value={<StatusBadge status={user.status} />} />
        <InfoItem label="입사일" value={formatDate(user.joinAt)} />
        <InfoItem label="가입일" value={formatDate(user.createdAt)} />
        {isAdminRole(user.role) && (
          <div className="sm:col-span-2 lg:col-span-4">
            <InfoItem label="관리자 기능" value={<AdminPermissionsText role={user.role} permissions={user.adminPermissions} />} />
          </div>
        )}
      </dl>

      {isSelf ? (
        <p className="rounded-md border bg-muted/50 px-4 py-3 text-muted-foreground">
          본인 계정의 권한·상태는 변경할 수 없습니다.
        </p>
      ) : lockedAdminAccount ? (
        <p className="rounded-md border bg-muted/50 px-4 py-3 text-muted-foreground">
          관리자 계정의 권한·상태는 슈퍼관리자만 변경할 수 있습니다.
        </p>
      ) : (
        <>
          {/* key: 저장 후 서버 값이 바뀌면 입력 상태를 새로 맞춘다. */}
          {user.role === "GUEST" ? (
            <ApproveForm user={user} roles={approvedRolesFor(isSuperAdmin)} />
          ) : isSuperAdmin ? (
            <RoleForm key={`${user.role}:${user.adminPermissions.join(",")}`} user={user} />
          ) : (
            <p className="text-sm text-muted-foreground">관리자 지정과 관리자 기능 지정은 슈퍼관리자만 할 수 있습니다.</p>
          )}
          <StatusForm key={user.status} user={user} />
        </>
      )}
    </div>
  );
}

// 가입 승인: GUEST → USER (슈퍼관리자는 ADMIN·SUPER_ADMIN도, 관리자 기능은 승인 후 권한 변경에서 지정)
// 입사일(연차 계산에 필요)이 먼저 등록되어 있어야 승인할 수 있다. 입사일은 회원 상세의 기본 정보에서 등록한다. (서버도 400으로 검사)
function ApproveForm({ user, roles }: { user: AdminUserDetail; roles: ApprovedRole[] }) {
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
              {roles.map((r) => (
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

// 권한 변경 (슈퍼관리자만): 권한 + ADMIN이면 관리자 기능 체크
// - 관리자 → 직원이면 서버가 관리자 기능을 비운다.
// - 관리자 권한이 줄어드는 회원(강등·기능 해제)은 서버가 tokenVersion을 올려 다시 로그인하게 한다.
function RoleForm({ user }: { user: AdminUserDetail }) {
  const [role, setRole] = useState<ApprovedRole>(user.role === "GUEST" ? "USER" : user.role);
  const [permissions, setPermissions] = useState<AdminPermission[]>(user.adminPermissions);
  const mutation = useAdminUserMutation((next: { role: ApprovedRole; permissions?: AdminPermission[] }) =>
    updateUserRole(user.id, next.role, next.permissions),
  );

  const permissionsChanged =
    role === "ADMIN" &&
    (permissions.length !== user.adminPermissions.length || permissions.some((p) => !user.adminPermissions.includes(p)));
  const changed = role !== user.role || permissionsChanged;
  const reduced =
    (user.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") ||
    (user.role === "ADMIN" && role !== "SUPER_ADMIN" && (role !== "ADMIN" || user.adminPermissions.some((p) => !permissions.includes(p))));

  const togglePermission = (permission: AdminPermission, checked: boolean) =>
    setPermissions((prev) => (checked ? [...prev, permission] : prev.filter((p) => p !== permission)));

  const handleSave = () =>
    mutation.mutate(
      // 저장 순서를 화면 순서와 맞춘다.
      { role, permissions: role === "ADMIN" ? ADMIN_PERMISSIONS.filter((p) => permissions.includes(p)) : undefined },
      {
        onSuccess: () => toast.success(`권한을 ${ROLE_LABEL[role]}(으)로 변경했습니다.`),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  return (
    <div className="grid gap-3">
      <InlineSelectRow
        id="user-role"
        label="권한"
        hint={reduced ? "관리자 권한이 줄어들어 이 회원은 다시 로그인해야 합니다." : undefined}
        value={role}
        options={approvedRolesFor(true).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
        onValueChange={(v) => setRole(v as ApprovedRole)}
        changed={changed}
        pending={mutation.isPending}
        onSave={handleSave}
      />
      {role === "ADMIN" && (
        <fieldset className="grid gap-2 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">관리자 기능</legend>
          <p className="text-sm text-muted-foreground">체크한 관리 화면만 사용할 수 있습니다. 바꾼 뒤 [변경]을 눌러 저장하세요.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ADMIN_PERMISSIONS.map((permission) => (
              <div key={permission} className="flex items-center gap-2">
                <Checkbox
                  id={`admin-permission-${permission}`}
                  checked={permissions.includes(permission)}
                  onCheckedChange={(v) => togglePermission(permission, v === true)}
                />
                <Label htmlFor={`admin-permission-${permission}`} className="font-normal">
                  {ADMIN_PERMISSION_LABEL[permission]}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {role === "SUPER_ADMIN" && (
        <p className="text-sm text-muted-foreground">슈퍼관리자는 모든 관리자 기능을 쓰고, 다른 회원의 관리자 권한을 지정할 수 있습니다.</p>
      )}
    </div>
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
