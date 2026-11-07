import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BoardView } from "@/features/board/components/board-view";

export const metadata: Metadata = { title: "게시판" };

// URL의 boardId만 숫자로 확인하고, 권한에 따른 조회·표시는 클라이언트 컴포넌트가 한다. (토큰이 브라우저 메모리에 있음)
export default async function BoardPage({ params }: PageProps<"/boards/[boardId]">) {
  const { boardId: raw } = await params;
  const boardId = Number(raw);
  if (!Number.isInteger(boardId) || boardId <= 0) notFound();

  return <BoardView boardId={boardId} />;
}
