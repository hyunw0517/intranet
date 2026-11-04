// 백엔드 comments.controller 대응 (/boards/:boardId/posts/:postId/comments/*)
// 조회는 게시판 읽기 권한, 작성·수정·삭제는 댓글 권한. 수정은 작성자만, 삭제는 작성자 또는 게시판 관리자.
import { apiFetch } from "@/services/api-client";
import type { PostComment } from "@/types/post";

const base = (boardId: number, postId: number) => `/boards/${boardId}/posts/${postId}/comments`;

// 페이지 없이 트리 전체를 받는다. (페이지는 화면에서 최상위 댓글 단위로 나눈다)
export function fetchComments(boardId: number, postId: number) {
  return apiFetch<PostComment[]>(base(boardId, postId));
}

// parentCommentId: 답글이면 부모 댓글 id. 다른 게시글의 댓글이거나 삭제된 댓글이면 400
// comment: 1~1000자, 공백만 있으면 400
export function createComment(boardId: number, postId: number, input: { comment: string; parentCommentId?: number | null }) {
  return apiFetch<{ id: number }>(base(boardId, postId), { method: "POST", body: input });
}

// 내용만 바꿀 수 있다. (parentCommentId를 보내면 400)
export function updateComment(boardId: number, postId: number, commentId: number, comment: string) {
  return apiFetch<{ id: number }>(`${base(boardId, postId)}/${commentId}`, { method: "PATCH", body: { comment } });
}

export function deleteComment(boardId: number, postId: number, commentId: number) {
  return apiFetch<boolean>(`${base(boardId, postId)}/${commentId}`, { method: "DELETE" });
}
