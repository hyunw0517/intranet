// 게시글·댓글 응답 타입 (백엔드 posts.service / comments.service 응답 기준, 날짜는 ISO 문자열)
import type { BoardType } from "./board";
import type { FileInfo } from "./file";
import type { PageMeta } from "./pagination";

// 게시판 권한 판정 결과 (BoardPermission) - 버튼 표시용. 실제 차단은 각 API가 서버에서 다시 검사한다.
export interface BoardPermission {
  read: boolean;
  write: boolean;
  comment: boolean;
  admin: boolean; // 게시판 관리: 다른 사람 글·댓글 삭제, 고정
}

// 목록·상세 응답에 함께 오는 게시판 정보 (BoardAccess.board)
export interface PostBoardInfo {
  id: number;
  type: BoardType;
  name: string;
  description: string | null;
  allowSecret: boolean;
  isAnonymous: boolean;
}

// GET /boards/:boardId 응답 (BoardAccess) - 게시글 없이 게시판 설정·권한이 필요한 화면(글쓰기)에서 사용
export interface BoardAccess {
  board: PostBoardInfo;
  perm: BoardPermission;
}

// 작성자 (익명 게시판의 다른 사람 글, 볼 수 없는 비밀글이면 null)
export interface PostAuthor {
  id: number;
  name: string;
  nickname: string | null;
}

// 작성(최종 수정) 당시 소속 스냅샷 - 작성자를 가리면 함께 null
interface AuthorSnapshot {
  author: PostAuthor | null;
  authorDepartmentName: string | null;
  authorPositionName: string | null;
  authorJobTitleName: string | null;
}

// GET /boards/:boardId/posts 항목
// 볼 수 없는 비밀글은 서버가 제목을 "비밀글입니다."로, 작성자를 null로 바꿔서 보낸다.
export interface PostListItem extends AuthorSnapshot {
  id: number;
  title: string;
  isPinned: boolean;
  isSecret: boolean;
  viewCount: number;
  likeCount: number;
  eventStartAt: string | null; // 캘린더 게시판만 값이 있다.
  eventEndAt: string | null;
  isAllDay: boolean | null;
  createdAt: string;
  updatedAt: string;
  _count: { comments: number }; // 삭제되지 않은 댓글 수
  // 대표 이미지(본문 첫 번째 이미지) 썸네일 주소. 앨범 게시판만 값이 있고,
  // 이미지가 없는 글·볼 수 없는 비밀글·앨범이 아닌 게시판은 null
  thumbnailUrl: string | null;
  // 본문 이미지 수 (앨범 카드의 "+추가 이미지 수" 표시용). 앨범이 아닌 게시판·볼 수 없는 비밀글은 0
  imageCount: number;
}

// GET /boards/:boardId/posts 응답
// pinned: 고정글 (모든 페이지 상단, 검색 중에는 빈 배열이고 고정글도 data에 섞인다)
export interface PostListResult {
  board: PostBoardInfo;
  perm: BoardPermission;
  pinned: PostListItem[];
  data: PostListItem[];
  meta: PageMeta;
}

// GET /boards/:boardId/posts/:postId 응답
export interface PostDetail extends AuthorSnapshot {
  id: number;
  title: string;
  content: string | null; // 서버에서 허용 태그만 남긴 HTML (본문이 비면 null)
  isPinned: boolean;
  isSecret: boolean;
  viewCount: number;
  likeCount: number;
  eventStartAt: string | null; // 캘린더 게시판만 값이 있다.
  eventEndAt: string | null;
  isAllDay: boolean | null;
  createdAt: string;
  updatedAt: string; // 조회수·좋아요·고정 변경에도 갱신되므로 "수정됨" 판단에 쓰지 않는다.
  editedAt: string | null; // 내용을 수정한 시각 (updatePost에서만 기록, 수정한 적 없으면 null)
  board: PostBoardInfo;
  can: {
    edit: boolean; // 작성자 + 쓰기 권한 (관리자도 남의 글은 수정 불가)
    delete: boolean; // 작성자 또는 게시판 관리자
    pin: boolean;
    comment: boolean;
  };
  liked: boolean; // 내가 좋아요를 눌렀는지 (좋아요 버튼의 처음 상태)
  files: FileInfo[]; // 첨부파일 (본문 이미지는 content 안에 있다)
}

// GET /boards/:boardId/posts/:postId/comments 항목
// 트리 순서(부모 → 자식, 같은 부모 안에서는 작성순)의 평평한 목록. depth는 최상위 0.
// 삭제된 댓글은 답글이 남아 있을 때만 자리로 남고, 내용·작성자는 null이다.
export interface PostComment extends AuthorSnapshot {
  id: number;
  parentCommentId: number | null;
  depth: number;
  deleted: boolean;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  can: { edit: boolean; delete: boolean };
}
