"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { createBoardAuth, deleteBoardAuth, updateBoardAuth, type BoardAuthInput } from "@/services/api/board-auths";
import { BOARD_TYPE_LABEL, type BoardAuthRule } from "@/types/board";
import { useAdminBoardMutation, useAdminBoards, useBoardAuths } from "../../hooks/use-admin-boards";
import { BoardAuthDialog } from "./board-auth-dialog";
import { describeRuleTarget, PermissionBadges } from "./board-auth-rule";

type DialogState = { rule: BoardAuthRule | null } | null; // rule이 null이면 추가

// 게시판 권한 설정: 한 게시판의 권한 규칙 목록 + 추가·수정·삭제
// 게시판 정보는 별도 단건 API 없이 관리자 게시판 목록(같은 캐시)에서 찾는다.
export function BoardAuthView({ boardId }: { boardId: number }) {
  const boards = useAdminBoards();
  const board = boards.data?.find((b) => b.id === boardId);
  // 카테고리에는 규칙을 둘 수 없으므로(서버 400) 게시판일 때만 조회한다.
  const auths = useBoardAuths(boardId, !!board && board.type !== "CATEGORY");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<BoardAuthRule | null>(null);

  const saveMutation = useAdminBoardMutation<BoardAuthInput, unknown>((input) =>
    dialog?.rule ? updateBoardAuth(boardId, dialog.rule.id, input) : createBoardAuth(boardId, input),
  );
  const deleteMutation = useAdminBoardMutation((authId: number) => deleteBoardAuth(boardId, authId));

  const openDialog = (rule: BoardAuthRule | null) => {
    saveMutation.reset();
    setDialog({ rule });
  };

  const handleSave = (input: BoardAuthInput) =>
    saveMutation.mutate(input, {
      onSuccess: () => {
        toast.success(dialog?.rule ? "권한 규칙을 수정했습니다." : "권한 규칙을 추가했습니다.");
        setDialog(null);
      },
    });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("권한 규칙을 삭제했습니다.");
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err));
        setDeleteTarget(null);
      },
    });
  };

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 text-muted-foreground">
      <Link href="/admin/boards">
        <ChevronLeft aria-hidden />
        게시판 관리
      </Link>
    </Button>
  );

  if (boards.isPending) return <>{backLink}<LoadingState /></>;
  if (boards.isError) return <>{backLink}<ErrorState error={boards.error} onRetry={() => boards.refetch()} /></>;
  if (!board) return <>{backLink}<EmptyState message="존재하지 않거나 삭제된 게시판입니다." /></>;
  if (board.type === "CATEGORY") {
    return <>{backLink}<EmptyState message="카테고리에는 권한을 설정할 수 없습니다. 하위 게시판 중 하나라도 볼 수 있으면 카테고리가 표시됩니다." /></>;
  }

  const rules = auths.data ?? [];

  return (
    <div className="grid gap-4">
      <div>
        {backLink}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{board.path.replaceAll("/", " / ")}</h2>
              <Badge variant="secondary">{BOARD_TYPE_LABEL[board.type]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              규칙의 조건에 해당하는 회원이 그 규칙의 권한을 받습니다. 관리자는 규칙과 관계없이 모든 권한을 가집니다.
            </p>
          </div>
          <Button onClick={() => openDialog(null)} className="shrink-0 self-start sm:self-auto">
            <Plus aria-hidden />
            규칙 추가
          </Button>
        </div>
      </div>

      {auths.isPending ? (
        <LoadingState />
      ) : auths.isError ? (
        <ErrorState error={auths.error} onRetry={() => auths.refetch()} />
      ) : rules.length === 0 ? (
        <EmptyState message="권한 규칙이 없어 관리자만 볼 수 있습니다. 모든 회원에게 열려면 조건을 비운 규칙을 추가하세요." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid min-w-0 gap-1.5">
                <p className="font-medium break-keep">{describeRuleTarget(rule)}</p>
                <PermissionBadges rule={rule} />
              </div>
              <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                <Button variant="ghost" size="sm" onClick={() => openDialog(rule)}>
                  수정
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(rule)}>
                  삭제
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BoardAuthDialog
        open={dialog !== null}
        rule={dialog?.rule ?? null}
        onClose={() => setDialog(null)}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="권한 규칙 삭제"
        description={
          rules.length === 1
            ? "마지막 규칙입니다. 삭제하면 이 게시판은 관리자만 볼 수 있습니다."
            : `${deleteTarget ? describeRuleTarget(deleteTarget) : ""} 규칙을 삭제합니다.`
        }
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
