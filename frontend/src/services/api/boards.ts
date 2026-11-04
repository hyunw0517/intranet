// 백엔드 boards.controller 대응 (/boards/*)
import { apiFetch } from "@/services/api-client";
import type { AdminBoard, BoardType } from "@/types/board";
import type { BoardAccess } from "@/types/post";

// POST /boards, PATCH /boards/:id (CreateBoardDto / UpdateBoardDto)
// 수정 시 생략한 필드는 서버가 기존 값을 유지한다. (name은 항상 필수)
export interface BoardInput {
  name: string;
  type: BoardType;
  parentBoardId: number | null; // null이면 최상위. 상위는 카테고리만 가능하고, 카테고리는 최상위에만 둔다.
  description: string; // 빈 문자열이면 서버에서 null로 저장
  isAnonymous?: boolean;
  allowSecret?: boolean;
}

// 직원용 게시판 단건 - 게시판 설정(타입·비밀글 허용·익명)과 내 권한. 읽기 권한이 없거나 카테고리면 404.
export function fetchBoard(boardId: number) {
  return apiFetch<BoardAccess>(`/boards/${boardId}`);
}

// 관리자 전체 게시판 - 수십 개 수준이라 페이지네이션 없이 트리 순서 전체를 받는다.
export function fetchAdminBoards() {
  return apiFetch<AdminBoard[]>("/boards/admin");
}

export function createBoard(input: BoardInput) {
  return apiFetch<AdminBoard>("/boards", { method: "POST", body: input });
}

// 타입 변경·상위 이동은 서버가 계층 규칙과 게시글 유무로 검사한다. (불가하면 400)
export function updateBoard(id: number, input: BoardInput) {
  return apiFetch<AdminBoard>(`/boards/${id}`, { method: "PATCH", body: input });
}

// 하위 게시판이 있는 카테고리, 게시글이 있는 게시판은 서버가 400으로 거부한다.
export function deleteBoard(id: number) {
  return apiFetch<boolean>(`/boards/${id}`, { method: "DELETE" });
}

// 같은 상위(null이면 최상위) 아래의 형제 게시판 id 전체를 화면 순서대로 보낸다.
export function reorderBoards(parentBoardId: number | null, ids: number[]) {
  return apiFetch<boolean>("/boards/order", { method: "PATCH", body: { parentBoardId, ids } });
}
