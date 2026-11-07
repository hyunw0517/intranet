import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostEditView } from "@/features/board/components/post-write-view";

export const metadata: Metadata = { title: "글 수정" };

export default async function PostEditPage({ params }: PageProps<"/boards/[boardId]/posts/[postId]/edit">) {
  const { boardId: rawBoard, postId: rawPost } = await params;
  const boardId = Number(rawBoard);
  const postId = Number(rawPost);
  if (!Number.isInteger(boardId) || boardId <= 0 || !Number.isInteger(postId) || postId <= 0) notFound();

  return <PostEditView boardId={boardId} postId={postId} />;
}
