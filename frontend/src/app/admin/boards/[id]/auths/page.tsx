import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { BoardAuthView } from "@/features/admin/components/boards/board-auth-view";

export const metadata: Metadata = { title: "게시판 권한" };

// URL의 id만 숫자로 확인하고, 조회·표시는 클라이언트 컴포넌트가 한다. (토큰이 브라우저 메모리에 있음)
export default async function AdminBoardAuthsPage({ params }: PageProps<"/admin/boards/[id]/auths">) {
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isInteger(boardId) || boardId <= 0) notFound();

  return (
    <>
      <PageHeader title="게시판 권한" />
      <BoardAuthView boardId={boardId} />
    </>
  );
}
