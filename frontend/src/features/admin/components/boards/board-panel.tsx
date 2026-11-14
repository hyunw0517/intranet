"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, Folder, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";
import { createBoard, deleteBoard, reorderBoards, updateBoard, type BoardInput } from "@/services/api/boards";
import { BOARD_TYPE_LABEL, type AdminBoard } from "@/types/board";
import { adminBoardKeys, useAdminBoardMutation, useAdminBoards } from "../../hooks/use-admin-boards";
import { groupByParent, SortableList, SortSaveBar, useGroupedSortDrafts } from "../organization/sortable-list";
import { CollapseAllBar, CollapseToggle, useCollapsedIds, type CollapsedIds } from "../organization/tree-collapse";
import { BoardFormDialog, type BoardDialogState } from "./board-form-dialog";

type BoardSortDrafts = ReturnType<typeof useGroupedSortDrafts<AdminBoard>>;

// 게시판 관리: 카테고리 → 하위 게시판 트리 + 추가·수정·삭제 + 같은 상위 안에서 드래그 정렬
// 게시판은 수십 개 수준이라 페이지네이션 없이 전체를 그린다.
export function BoardPanel() {
  const queryClient = useQueryClient();
  const { data: boards, isPending, isError, error, refetch } = useAdminBoards();
  const [dialog, setDialog] = useState<BoardDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminBoard | null>(null);
  const childrenOf = groupByParent(boards ?? [], (b) => b.parentBoardId);
  const sort = useGroupedSortDrafts(childrenOf);
  const collapse = useCollapsedIds();
  const parentIds = [...childrenOf.keys()].filter((id): id is number => id !== null);

  const saveMutation = useAdminBoardMutation((input: BoardInput) =>
    dialog?.mode === "edit" ? updateBoard(dialog.board.id, input) : createBoard(input),
  );
  const deleteMutation = useAdminBoardMutation((id: number) => deleteBoard(id));
  // 바뀐 형제 그룹마다 순서 변경 요청 (그룹 하나가 요청 하나, 각 요청은 서버에서 트랜잭션)
  const orderMutation = useAdminBoardMutation(async (groups: { parentId: number | null; ids: number[] }[]) => {
    for (const group of groups) await reorderBoards(group.parentId, group.ids);
  });

  const openDialog = (next: NonNullable<BoardDialogState>) => {
    saveMutation.reset();
    setDialog(next);
  };

  const handleSave = (input: BoardInput) =>
    saveMutation.mutate(input, {
      onSuccess: () => {
        toast.success(dialog?.mode === "edit" ? "게시판을 수정했습니다." : "게시판을 추가했습니다.");
        collapse.expand(input.parentBoardId); // 접힌 카테고리 아래로 추가·이동해도 바로 보이게
        setDialog(null);
      },
    });

  // 하위 게시판이 있는 카테고리는 서버가 거부하고 그 메시지를 보여 준다.
  // 게시글이 있는 게시판은 확인 창에서 경고만 하고 삭제한다. (게시글은 서버에 남는다)
  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.name}을(를) 삭제했습니다.`);
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err));
        setDeleteTarget(null);
      },
    });
  };

  const handleSaveOrder = () =>
    orderMutation.mutate(sort.changedGroups, {
      onSuccess: () => {
        toast.success("게시판 순서를 저장했습니다.");
        sort.reset();
      },
      // 여러 그룹 중 일부만 저장됐을 수 있으므로 최신 목록으로 다시 맞춘다.
      onError: (err) => {
        toast.error(getErrorMessage(err));
        sort.reset();
        queryClient.invalidateQueries({ queryKey: adminBoardKeys.list() });
      },
    });

  const renderActions = (b: AdminBoard) =>
    b.type === "CATEGORY" ? (
      <>
        <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "add", parentId: b.id })}>
          게시판 추가
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "edit", board: b })}>
          수정
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(b)}>
          삭제
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/boards/${b.id}/auths`}>권한 설정</Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openDialog({ mode: "edit", board: b })}>
          수정
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(b)}>
          삭제
        </Button>
      </>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          카테고리 아래에 게시판을 둡니다. 순서는 같은 카테고리(또는 최상위) 안에서만 바꿀 수 있습니다.
        </p>
        <Button onClick={() => openDialog({ mode: "add", parentId: null })} className="shrink-0 self-start sm:self-auto">
          <Plus aria-hidden />
          게시판 추가
        </Button>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : boards.length === 0 ? (
        <EmptyState message="등록된 게시판이 없습니다." />
      ) : (
        <>
          <SortSaveBar
            visible={sort.changedGroups.length > 0}
            pending={orderMutation.isPending}
            onCancel={sort.reset}
            onSave={handleSaveOrder}
          />
          <div className="grid gap-1">
            <CollapseAllBar collapse={collapse} parentIds={parentIds} />
            {/* 행마다 위 테두리를 두고, 첫 행의 테두리는 바깥 테두리 밑으로 숨긴다(-mt-px). 중첩 목록이라 divide-y를 쓸 수 없다. */}
            <div className="overflow-hidden rounded-lg border">
              <BoardGroup
                parentId={null}
                className="-mt-px"
                sort={sort}
                collapse={collapse}
                renderActions={renderActions}
              />
            </div>
          </div>
        </>
      )}

      <BoardFormDialog
        state={dialog}
        onClose={() => setDialog(null)}
        boards={boards ?? []}
        pending={saveMutation.isPending}
        error={saveMutation.error}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.type === "CATEGORY" ? "카테고리 삭제" : "게시판 삭제"}
        description={
          deleteTarget?.type === "CATEGORY"
            ? `${deleteTarget.name} 카테고리를 삭제합니다. 하위 게시판이 있으면 삭제할 수 없습니다.`
            : deleteTarget && deleteTarget.postCount > 0
              ? `⚠ ${deleteTarget.path} 게시판에 게시글 ${deleteTarget.postCount.toLocaleString()}개가 있습니다. 삭제하면 회원이 이 게시글들을 볼 수 없게 됩니다. (게시글은 지우지 않고 보관하며, 게시판을 복구하면 다시 보입니다) 권한 규칙도 함께 삭제됩니다. 삭제할까요?`
              : `${deleteTarget?.path ?? ""} 게시판을 삭제합니다. 권한 규칙도 함께 삭제됩니다.`
        }
        confirmLabel="삭제"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// 한 상위 아래의 형제 게시판 목록 (카테고리 안에 자기 하위 게시판 목록을 다시 그린다)
// 형제 그룹마다 별도의 정렬 목록이라 다른 카테고리로는 끌어다 놓을 수 없다. (카테고리 이동은 [수정]에서)
function BoardGroup({
  parentId,
  className,
  sort,
  collapse,
  renderActions,
}: {
  parentId: number | null;
  className?: string;
  sort: BoardSortDrafts;
  collapse: CollapsedIds;
  renderActions: (board: AdminBoard) => React.ReactNode;
}) {
  const siblings = sort.ordered(parentId);
  if (siblings.length === 0) return null;

  return (
    <SortableList
      items={siblings}
      onReorder={(ids) => sort.setDraft(parentId, ids)}
      className={className}
      renderItem={(b, handle) => {
        const hasChildren = sort.ordered(b.id).length > 0;
        const collapsed = collapse.isCollapsed(b.id);
        return (
          <>
            <div className="flex flex-col gap-2 border-t py-2 pr-4 pl-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-1" style={{ paddingLeft: `${b.depth}rem` }}>
                {handle}
                {/* 손잡이(size-7)와 높이를 맞추려고 한 번 감싼다. (행이 설명 때문에 두 줄이 되어도 첫 줄에 붙음) */}
                <div className="flex h-7 items-center">
                  <CollapseToggle
                    name={b.name}
                    hasChildren={hasChildren}
                    collapsed={collapsed}
                    onToggle={() => collapse.toggle(b.id)}
                  />
                </div>
                <div className="grid min-w-0 gap-0.5 pt-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {b.type === "CATEGORY" ? (
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      b.depth > 0 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className={b.type === "CATEGORY" ? "font-semibold" : "font-medium"}>{b.name}</span>
                    <span className="sr-only">({b.path})</span>
                    {b.type !== "CATEGORY" && <BoardMeta board={b} />}
                  </div>
                  {b.description && <p className="truncate text-xs text-muted-foreground">{b.description}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">{renderActions(b)}</div>
            </div>
            {/* 접힌 카테고리는 하위 목록을 그리지 않는다. (저장 전 순서는 sort 상태에 남아 다시 펼쳐도 유지) */}
            {b.type === "CATEGORY" && !collapsed && (
              <BoardGroup parentId={b.id} sort={sort} collapse={collapse} renderActions={renderActions} />
            )}
          </>
        );
      }}
    />
  );
}

// 게시판 타입·게시글 수·권한 상태
// 권한 규칙이 없으면 관리자만 볼 수 있으므로(기본 거부) 관리자가 놓치지 않게 따로 표시한다.
function BoardMeta({ board }: { board: AdminBoard }) {
  return (
    <>
      <Badge variant="secondary">{BOARD_TYPE_LABEL[board.type]}</Badge>
      <span className="text-xs text-muted-foreground">글 {board.postCount.toLocaleString()}</span>
      {board.authCount === 0 ? (
        <Badge variant="outline" className="text-muted-foreground">
          관리자만 열람
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">권한 규칙 {board.authCount}</span>
      )}
    </>
  );
}
