import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_LABEL, type ProjectProgress, type ProjectStatus } from "@/types/project";

// 상태 배지 - 강조색은 진행 중일 때만 쓰고, 나머지는 차분하게 (요구사항 2.1: 강조 배지 남발 금지)
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const variant = status === "IN_PROGRESS" ? "default" : status === "CANCELLED" ? "destructive" : status === "PLANNED" ? "outline" : "secondary";
  return <Badge variant={variant}>{PROJECT_STATUS_LABEL[status]}</Badge>;
}

// 진척도 막대 + 숫자 (완료 / 전체)
export function ProgressBar({ progress, className }: { progress: ProjectProgress; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={`진척도 ${progress.percent}%`}
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percent}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {progress.percent}% ({progress.done}/{progress.total})
      </span>
    </div>
  );
}

// 기간 표기 (둘 다 없으면 "-")
export function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return "-";
  return `${start?.slice(0, 10) ?? "미정"} ~ ${end?.slice(0, 10) ?? "미정"}`;
}
