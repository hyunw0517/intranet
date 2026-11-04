// 게시판 공통 타입 (관리자 게시판·권한 화면, 이후 직원용 게시판 메뉴·게시글에서 사용)
import type { NamedRef } from "./organization";

// 백엔드 Prisma enum BoardType
export type BoardType = "CATEGORY" | "NORMAL" | "NOTICE" | "CALENDAR" | "ALBUM";

export const BOARD_TYPE_LABEL: Record<BoardType, string> = {
  CATEGORY: "카테고리",
  NORMAL: "일반",
  NOTICE: "공지",
  CALENDAR: "캘린더",
  ALBUM: "앨범",
};

// 관리자 화면에서 고를 수 있는 타입
// 앨범의 썸네일·그리드 목록은 파일 기능 이후 구현 예정. 
export const SELECTABLE_BOARD_TYPES: BoardType[] = ["CATEGORY", "NORMAL", "NOTICE", "CALENDAR", "ALBUM"];

// GET /boards/admin → 트리 순서(카테고리 → 하위 게시판)의 평평한 목록 (백엔드 toTreeList)
export interface AdminBoard {
  id: number;
  parentBoardId: number | null;
  type: BoardType;
  name: string;
  description: string | null;
  sortOrder: number;
  depth: number; // 최상위 0, 카테고리 하위 1 (최대 2단계)
  path: string; // 최상위부터 자기까지의 이름 (구분자 /)
  postCount: number; // 삭제되지 않은 게시글 수
  authCount: number; // 권한 규칙 수 (0이면 관리자만 볼 수 있음)
  isAnonymous: boolean; // 익명 게시판 (작성자를 본인 외에 가림)
  allowSecret: boolean; // 비밀글 허용
}

// GET /boards/:boardId/auths 항목 - 게시판 권한 규칙
// 조건(부서·최소 직급·허용 직책)이 비어 있으면 그 조건은 검사하지 않는다. 모두 비어 있으면 전체 회원.
export interface BoardAuthRule {
  id: number;
  boardId: number;
  departmentId: number | null;
  includeSubDepartment: boolean;
  positionId: number | null;
  department: NamedRef | null;
  position: (NamedRef & { sortOrder: number }) | null;
  jobTitles: NamedRef[];
  authRead: boolean;
  authWrite: boolean;
  authComment: boolean;
  authAdmin: boolean; // 다른 사람이 쓴 게시글·댓글 삭제
}

// GET /boards/navigation 항목 - 읽기 권한이 있는 게시판만 트리 순서로 (백엔드 getUserBoardNavigate)
// 카테고리는 볼 수 있는 하위 게시판이 하나라도 있을 때만 포함된다.
export interface BoardNavItem {
  id: number;
  parentBoardId: number | null;
  type: BoardType;
  name: string;
  description: string | null;
  sortOrder: number;
  depth: number; // 최상위 0, 카테고리 하위 1
  path: string; // 최상위부터 자기까지의 이름 (구분자 /)
}
