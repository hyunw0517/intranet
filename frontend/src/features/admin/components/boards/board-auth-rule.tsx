import { Badge } from "@/components/ui/badge";
import type { NamedRef } from "@/types/organization";
import type { BoardAuthRule } from "@/types/board";

// 규칙의 대상 조건을 한 문장으로 (목록 표시·추가 모달 미리보기 공용)
// 조건이 모두 비어 있으면 전체 회원 규칙이다.
export function describeRuleTarget(rule: {
  department: NamedRef | null;
  includeSubDepartment: boolean;
  position: NamedRef | null;
  jobTitles: NamedRef[];
}) {
  const parts: string[] = [];
  if (rule.department) parts.push(`${rule.department.name}${rule.includeSubDepartment ? " (하위 부서 포함)" : ""}`);
  if (rule.position) parts.push(`${rule.position.name} 이상`);
  if (rule.jobTitles.length > 0) parts.push(`직책: ${rule.jobTitles.map((j) => j.name).join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "전체 회원";
}

const PERMISSION_LABELS: { key: keyof Pick<BoardAuthRule, "authRead" | "authWrite" | "authComment" | "authAdmin">; label: string }[] = [
  { key: "authRead", label: "읽기" },
  { key: "authWrite", label: "글쓰기" },
  { key: "authComment", label: "댓글" },
  { key: "authAdmin", label: "관리" },
];

// 켜진 권한만 배지로 표시
export function PermissionBadges({ rule }: { rule: BoardAuthRule }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PERMISSION_LABELS.filter((p) => rule[p.key]).map((p) => (
        <Badge key={p.key} variant="secondary">
          {p.label}
        </Badge>
      ))}
    </div>
  );
}
