import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  APPROVAL_STATUS_LABEL,
  STEP_STATUS_LABEL,
  type ApprovalStatus,
  type ApprovalStepStatus,
} from "@/types/approval";

// 문서 상태: 완료(승인)만 포인트 색, 반려는 오류 색, 진행 중은 테두리, 임시저장·회수는 회색
const STATUS_VARIANT: Record<ApprovalStatus, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  CANCELLED: "secondary",
  REQUESTED: "outline",
  IN_PROGRESS: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{APPROVAL_STATUS_LABEL[status]}</Badge>;
}

// 단계 상태: 글자 색으로만 구분 (결재선 칸 안에서 쓰므로 배지보다 가볍게)
export function StepStatusText({ status, className }: { status: ApprovalStepStatus; className?: string }) {
  return (
    <span
      className={cn(
        "text-xs font-medium",
        status === "APPROVED" && "text-primary",
        status === "REJECTED" && "text-destructive",
        status === "PENDING" && "text-foreground",
        status === "WAITING" && "text-muted-foreground",
        className,
      )}
    >
      {STEP_STATUS_LABEL[status]}
    </span>
  );
}
