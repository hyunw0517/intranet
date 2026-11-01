"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { BOARD_TYPE_LABEL } from "@/types/board";
import { useBoardNavigation } from "../hooks/use-board-navigation";

// 직원용 게시판 화면
// 단건 조회 API가 아직 없어 게시판 이름·설명은 메뉴와 같은 내비게이션 캐시에서 찾는다. (추가 요청 없음)
// 메뉴에 없는 게시판(없음·읽기 권한 없음·카테고리)은 서버 정책(404)과 같게 "찾을 수 없음"으로 보여 준다.
export function BoardView({ boardId }: { boardId: number }) {
  const { data, isPending, isError, error, refetch } = useBoardNavigation();

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  const board = data.find((b) => b.id === boardId && b.type !== "CATEGORY");
  if (!board) return <BoardNotFound />;

  const category = board.parentBoardId !== null ? data.find((b) => b.id === board.parentBoardId) : undefined;

  return (
    <>
      <PageHeader title={board.name} description={board.description ?? undefined} />
      <p className="mb-4 text-xs text-muted-foreground">
        {category ? `${category.name} · ` : ""}
        {BOARD_TYPE_LABEL[board.type]} 게시판
      </p>
      {/* 게시글 목록·작성은 게시글 API 구현 후 연결한다. (미구현 기능을 동작하는 것처럼 표시하지 않음) */}
      <EmptyState message="게시글 기능은 아직 구현되지 않았습니다." />
    </>
  );
}

function BoardNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <SearchX className="size-5" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">게시판을 찾을 수 없습니다</h1>
      <p className="mt-2 text-muted-foreground">삭제되었거나 볼 수 있는 권한이 없는 게시판입니다.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">대시보드로 이동</Link>
      </Button>
    </div>
  );
}
