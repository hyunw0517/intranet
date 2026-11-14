import { Badge } from "@/components/ui/badge";
import { ADMIN_PERMISSION_LABEL, ADMIN_PERMISSIONS, ROLE_LABEL, STATUS_LABEL, type AdminPermission, type UserRole, type UserStatus } from "@/types/user";

// 관리자 기능 목록 표시 (SUPER_ADMIN은 전부, 지정된 기능이 없으면 "없음")
export function AdminPermissionsText({ role, permissions }: { role: UserRole; permissions: AdminPermission[] }) {
  if (role === "SUPER_ADMIN") return <>모든 기능</>;
  if (permissions.length === 0) return <span className="text-muted-foreground">없음</span>;
  return <>{ADMIN_PERMISSIONS.filter((p) => permissions.includes(p)).map((p) => ADMIN_PERMISSION_LABEL[p]).join(", ")}</>;
}

// 승인 대기(GUEST)는 관리자가 처리해야 하므로 강조색, 나머지는 차분하게 표시한다.
export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={role === "GUEST" ? "default" : "secondary"}>{ROLE_LABEL[role]}</Badge>;
}

// 재직이 아닌 계정은 로그인할 수 없으므로 테두리 배지로 구분한다.
export function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant={status === "ACTIVE" ? "secondary" : "outline"} className={status === "RESIGNED" ? "text-muted-foreground" : undefined}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
