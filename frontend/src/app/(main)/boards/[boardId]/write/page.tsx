import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostCreateView } from "@/features/board/components/post-write-view";

export const metadata: Metadata = { title: "글쓰기" };

// URL 형식만 확인하고, 게시판 권한(쓰기)은 클라이언트가 목록 응답의 perm으로 확인한다. (서버도 작성 시 403)
export default async function PostWritePage({ params }: PageProps<"/boards/[boardId]/write">) {
  const { boardId: raw } = await params;
  const boardId = Number(raw);
  if (!Number.isInteger(boardId) || boardId <= 0) notFound();

  return <PostCreateView boardId={boardId} />;
}
