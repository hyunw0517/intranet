"use client";

import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TASK_STATUS_LABEL } from "@/types/project";
import { useMyTasks } from "../hooks/use-projects";

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// 내 할 일 - 내가 담당인 미완료 과제 (참여 중인 프로젝트만, 마감일 가까운 순, 마감일 없는 과제는 뒤)
// 누르면 그 프로젝트 칸반에서 과제 창이 열린다(?task=).
export function MyTasksView() {
  const { data, isPending, isError, error, refetch } = useMyTasks();
  const today = kstToday();

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (data.length === 0) return <EmptyState message="담당한 미완료 과제가 없습니다." />;

  return (
    <ul className="divide-y rounded-lg border">
      {data.map((task) => {
        const due = task.dueDate?.slice(0, 10) ?? null;
        const overdue = !!due && due < today;
        const dueToday = due === today;
        return (
          <li key={task.id}>
            <Link
              href={`/projects/${task.project.id}?task=${task.id}`}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{task.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{task.project.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <Badge variant={task.status === "IN_PROGRESS" ? "default" : "outline"}>{TASK_STATUS_LABEL[task.status]}</Badge>
                <span className={cn("w-28 text-right tabular-nums text-muted-foreground", (overdue || dueToday) && "text-destructive")}>
                  {due ? `${due}${overdue ? " 지남" : dueToday ? " 오늘" : ""}` : "마감일 없음"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
