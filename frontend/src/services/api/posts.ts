// 백엔드 posts.controller 대응 (/boards/:boardId/posts/*)
import { apiFetch, apiFetchBlob } from "@/services/api-client";
import type { CalendarEventColor } from "@/types/calendar";
import type { PostDetail, PostListResult } from "@/types/post";

// GET 정렬 기준 (PostSortBy) - 방향(order)은 생략하면 desc
export type PostSortBy = "createdAt" | "viewCount" | "likeCount";

// GET /boards/:boardId/posts (PaginatePostQueryDto)
// 검색 필드는 각각 부분 일치이고 여러 개를 보내면 AND. 익명 게시판에서 author를 보내면 400.
export type PostListQuery = {
  page?: number;
  take?: number; // 기본 20, 최대 100
  title?: string;
  content?: string; // 태그를 뺀 본문 텍스트로 검색
  author?: string; // 이름·닉네임
  sortBy?: PostSortBy;
  order?: "asc" | "desc";
};

// POST (CreatePostDto) / PATCH (UpdatePostDto)
// - isPinned: 작성 때만. 게시판 관리자가 아니면 서버가 무시하고 false로 저장. 수정은 pinPost로 따로 한다.
// - isSecret: 비밀글을 허용하지 않는 게시판이면 서버가 무시한다. (수정 시에는 기존 값 유지)
// - 일정: 캘린더 게시판만 필수. 시간대가 붙은 ISO 문자열로 보낸다. 종일이면 서버가 KST 00:00:00~23:59:59로 맞춘다.
export interface PostInput {
  title: string; // 1~100자
  content: string; // 에디터 HTML. 서버가 허용 태그만 남기고, 비어 있으면 null로 저장
  isPinned?: boolean;
  isSecret?: boolean;
  eventStartAt?: string | null;
  eventEndAt?: string | null;
  isAllDay?: boolean | null;
  eventColor?: CalendarEventColor | null; // 캘린더 게시판만 (null = 기본색, 수정에서 생략하면 유지)
  // 첨부파일 id 최종 목록 (먼저 uploadAttachment로 올린 파일, 순서 = 표시 순서)
  // 수정에서 생략하면 기존 첨부 유지, 배열을 보내면 이 목록으로 맞춘다. (빠진 파일은 삭제)
  // 본문 이미지는 보내지 않는다. 서버가 본문 <img>에서 찾아 연결하고, 다른 글의 이미지는 본문에서 제거한다.
  attachmentIds?: number[];
}

const base = (boardId: number) => `/boards/${boardId}/posts`;

// 목록 응답에 게시판 정보·권한(글쓰기 버튼, 비밀글 체크박스)이 함께 온다. 읽기 권한이 없으면 404.
export function fetchPosts(boardId: number, query: PostListQuery) {
  return apiFetch<PostListResult>(base(boardId), { query });
}

// 조회할 때마다 서버가 조회수를 1 올린다. (화면에서 다시 불러오는 횟수를 줄여야 한다)
export function fetchPost(boardId: number, postId: number) {
  return apiFetch<PostDetail>(`${base(boardId)}/${postId}`);
}

// 응답은 저장된 게시글 행 (이동할 id만 사용)
export function createPost(boardId: number, input: PostInput) {
  return apiFetch<{ id: number }>(base(boardId), { method: "POST", body: input });
}

// 작성자만 가능 (관리자도 남의 글은 403)
export function updatePost(boardId: number, postId: number, input: Omit<PostInput, "isPinned">) {
  return apiFetch<{ id: number }>(`${base(boardId)}/${postId}`, { method: "PATCH", body: input });
}

// 작성자 또는 게시판 관리자 (소프트 삭제)
export function deletePost(boardId: number, postId: number) {
  return apiFetch<boolean>(`${base(boardId)}/${postId}`, { method: "DELETE" });
}

// 게시판 관리자만. 게시판당 최대 10개 (초과 시 400)
export function pinPost(boardId: number, postId: number, isPinned: boolean) {
  return apiFetch<boolean>(`${base(boardId)}/${postId}/pin`, { method: "PATCH", body: { isPinned } });
}

// 첨부파일 다운로드 (게시글 읽기 권한, Bearer 헤더가 필요해 fetch → Blob)
export function downloadPostFile(boardId: number, postId: number, fileId: number) {
  return apiFetchBlob(`${base(boardId)}/${postId}/files/${fileId}`);
}

// 이미 눌렀으면 409
export function likePost(boardId: number, postId: number) {
  return apiFetch<boolean>(`${base(boardId)}/${postId}/like`, { method: "PATCH" });
}

// 누르지 않았으면 400
export function unlikePost(boardId: number, postId: number) {
  return apiFetch<boolean>(`${base(boardId)}/${postId}/unlike`, { method: "DELETE" });
}
