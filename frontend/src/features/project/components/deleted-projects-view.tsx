"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { restoreProject } from "@/services/api/projects";
import type { ProjectListItem } from "@/types/project";
import { useDeletedProjects, useProjectMutation } from "../hooks/use-projects";
import { formatPeriod, ProjectStatusBadge } from "./project-badges";

// 관리자 - 삭제된 프로젝트 목록 + 복구 (과제 관리 관리자, 2026-11-17 사용자 결정)
// 복구하면 참여자·과제가 삭제 전 그대로 보인다(삭제는 soft delete).
export function DeletedProjectsView() {
  const [page, setPage] = useState(1);
  const [restoring, setRestoring] = useState<ProjectListItem | null>(null);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useDeletedProjects(page);
  const restore = useProjectMutation(restoreProject);

  const runRestore = async () => {
    if (!restoring) return;
    try {
      await restore.mutateAsync(restoring.id);
      toast.success(`${restoring.name}을(를) 복구했습니다.`);
      setRestoring(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (data.data.length === 0) return <EmptyState message="삭제된 프로젝트가 없습니다." />;

  return (
    <div className={cn("grid gap-4", isPlaceholderData && "opacity-60")}>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>프로젝트</TableHead>
              <TableHead className="w-20">상태</TableHead>
              <TableHead>거래처</TableHead>
              <TableHead className="w-48">기간</TableHead>
              <TableHead className="w-40">삭제 시각</TableHead>
              <TableHead className="w-20"><span className="sr-only">복구</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <ProjectStatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">{p.client?.name ?? "-"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatPeriod(p.startDate, p.endDate)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(p.deletedAt)}</TableCell>
                <TableCell>
                  <Button variant="outline" size="sm" onClick={() => setRestoring(p)}>
                    <RotateCcw aria-hidden />
                    복구
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationBar meta={data.meta} onPageChange={setPage} />

      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title="프로젝트를 복구할까요?"
        description="참여자에게 다시 보이고, 과제·참여자는 삭제 전 그대로입니다."
        confirmLabel="복구"
        pending={restore.isPending}
        onConfirm={runRestore}
      />
    </div>
  );
}
