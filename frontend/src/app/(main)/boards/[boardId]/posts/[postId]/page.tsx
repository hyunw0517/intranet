import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostDetailView } from "@/features/board/components/post-detail-view";

export const metadata: Metadata = { title: "게시글" };

// URL의 id만 숫자로 확인하고, 조회·권한 표시는 클라이언트 컴포넌트가 한다. (토큰이 브라우저 메모리에 있음)
export default async function PostPage({ params }: PageProps<"/boards/[boardId]/posts/[postId]">) {
  const { boardId: rawBoard, postId: rawPost } = await params;
  const boardId = Number(rawBoard);
  const postId = Number(rawPost);
  if (!Number.isInteger(boardId) || boardId <= 0 || !Number.isInteger(postId) || postId <= 0) notFound();

  return <PostDetailView boardId={boardId} postId={postId} />;
}
