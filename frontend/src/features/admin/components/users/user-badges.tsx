import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, STATUS_LABEL, type UserRole, type UserStatus } from "@/types/user";

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
