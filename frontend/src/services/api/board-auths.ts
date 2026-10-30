// 백엔드 board-auth.controller 대응 (/boards/:boardId/auths/*)
import { apiFetch } from "@/services/api-client";
import type { BoardAuthRule } from "@/types/board";

// POST / PATCH 본문 (CreateBoardAuthDto / UpdateBoardAuthDto)
// 서버 정규화: 부서가 없으면 하위 부서 포함은 false, 쓰기·댓글·관리가 켜지면 읽기도 켬, 권한이 하나도 없으면 400
export interface BoardAuthInput {
  departmentId: number | null;
  includeSubDepartment: boolean;
  positionId: number | null; // 이 직급 이상
  jobTitleIds: number[]; // 빈 배열이면 직책 조건 없음 (수정 시 이 목록으로 전체 교체)
  authRead: boolean;
  authWrite: boolean;
  authComment: boolean;
  authAdmin: boolean;
}

// 게시판당 규칙 수가 적어 페이지네이션 없음 (카테고리는 규칙을 둘 수 없어 400)
export function fetchBoardAuths(boardId: number) {
  return apiFetch<BoardAuthRule[]>(`/boards/${boardId}/auths`);
}

export function createBoardAuth(boardId: number, input: BoardAuthInput) {
  return apiFetch<{ id: number }>(`/boards/${boardId}/auths`, { method: "POST", body: input });
}

export function updateBoardAuth(boardId: number, authId: number, input: BoardAuthInput) {
  return apiFetch<boolean>(`/boards/${boardId}/auths/${authId}`, { method: "PATCH", body: input });
}

// 규칙이 모두 지워진 게시판은 관리자만 볼 수 있다.
export function deleteBoardAuth(boardId: number, authId: number) {
  return apiFetch<boolean>(`/boards/${boardId}/auths/${authId}`, { method: "DELETE" });
}
