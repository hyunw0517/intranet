import { ApiProperty } from '@nestjs/swagger';
import { PageMetaResponse } from 'src/common/dto/page-meta-response.dto';
import { CalendarEventColor } from 'src/generated/prisma/client';
import { BoardInfoResponse, BoardPermResponse } from './board-response.dto';

//* 게시글·캘린더 응답 (문서용 클래스, docs/api.md 3.4)
// - 서비스는 Prisma 결과를 그대로 반환하고, 컨트롤러 반환 타입을 이 클래스로 적어 필드가 맞는지 typecheck가 검사한다.
// - 익명 게시판의 다른 사람 글은 author와 작성자 소속 이름이 null로 내려간다.

/** 작성자 */
export class PostAuthorResponse {
    id: number;

    name: string;

    nickname: string | null;
}

/** 댓글 수 */
export class PostCountResponse {
    comments: number;
}

/** 게시글과 일정 공통 필드 */
class PostEventFields {
    /** 일정 시작 (캘린더 게시판만, 아니면 null) */
    eventStartAt: Date | null;

    /** 일정 종료 */
    eventEndAt: Date | null;

    /** 종일 일정 */
    isAllDay: boolean | null;

    /** 일정 색 (null = 기본색) */
    @ApiProperty({ enum: CalendarEventColor, enumName: 'CalendarEventColor', nullable: true })
    eventColor: CalendarEventColor | null;
}

/** 게시글 목록 한 줄 */
export class PostListItemResponse extends PostEventFields {
    id: number;

    title: string;

    /** 고정 글 */
    isPinned: boolean;

    viewCount: number;

    likeCount: number;

    /** 비밀글 (볼 수 없는 사람에게는 제목이 "비밀글입니다."로 바뀌고 작성자가 가려진다) */
    isSecret: boolean;

    createdAt: Date;

    updatedAt: Date;

    /** 작성 당시 대표 소속 부서명 */
    authorDepartmentName: string | null;

    /** 작성 당시 대표 소속 직책명 */
    authorJobTitleName: string | null;

    /** 작성 당시 직급명 */
    authorPositionName: string | null;

    author: PostAuthorResponse | null;

    _count: PostCountResponse;

    /** 대표 이미지 썸네일 (앨범 카드, 없으면 null) */
    thumbnailUrl: string | null;

    /** 본문 이미지 수 (앨범 카드의 "+나머지 수") */
    imageCount: number;
}

/** 게시글 목록 */
export class PostListResponse {
    data: PostListItemResponse[];

    meta: PageMetaResponse;

    board: BoardInfoResponse;

    perm: BoardPermResponse;

    /** 고정 글 (모든 페이지 상단용, 최신순. 검색 중에는 비고 고정 글도 data에 섞인다) */
    pinned: PostListItemResponse[];
}

/** 게시글 행 (작성·수정 결과) */
export class PostResponse extends PostEventFields {
    id: number;

    boardId: number;

    authorId: number;

    authorDepartmentName: string | null;

    authorJobTitleName: string | null;

    authorPositionName: string | null;

    title: string;

    /** 본문 HTML (서버가 허용 태그만 남기도록 정제한 값) */
    content: string | null;

    /** 본문 텍스트 (검색용) */
    contentText: string | null;

    isPinned: boolean;

    viewCount: number;

    likeCount: number;

    isSecret: boolean;

    createdAt: Date;

    createdId: number;

    updatedAt: Date;

    updatedId: number;

    /** 작성자가 내용을 수정한 시각 (조회수·좋아요·고정 변경은 포함하지 않는다, 없으면 null) */
    editedAt: Date | null;

    deleted: boolean;

    deletedAt: Date | null;

    deletedId: number | null;
}

/** 첨부파일 */
export class PostFileResponse {
    id: number;

    originalName: string;

    /** 바이트 */
    size: number;

    mimeType: string;

    /** 이미지 공개 주소 (이미지가 아닌 첨부는 null - GET .../posts/:postId/files/:fileId 로 받는다) */
    url: string | null;

    thumbnailUrl: string | null;
}

/** 내가 할 수 있는 동작 (버튼 표시용, 실제로 막는 것은 각 API의 검사) */
export class PostCanResponse {
    /** 수정: 작성자 + 쓰기 권한 (관리자도 남의 글은 수정 불가) */
    edit: boolean;

    /** 삭제: 작성자 또는 게시판 관리 권한 */
    delete: boolean;

    /** 고정: 게시판 관리 권한 */
    pin: boolean;

    comment: boolean;
}

/** 게시글 상세 */
export class PostDetailResponse extends PostEventFields {
    id: number;

    title: string;

    /** 본문 HTML (정제된 값) */
    content: string | null;

    isPinned: boolean;

    /** 조회수 (이번 조회로 1 증가한 값) */
    viewCount: number;

    likeCount: number;

    isSecret: boolean;

    createdAt: Date;

    updatedAt: Date;

    editedAt: Date | null;

    authorDepartmentName: string | null;

    authorJobTitleName: string | null;

    authorPositionName: string | null;

    author: PostAuthorResponse | null;

    /** 내가 좋아요를 눌렀는지 */
    liked: boolean;

    /** 첨부파일 (본문 이미지는 본문 HTML에 있어 제외) */
    files: PostFileResponse[];

    board: BoardInfoResponse;

    can: PostCanResponse;
}

/** 게시판 이름 */
export class BoardNameResponse {
    name: string;
}

/** 최근 공지 한 줄 (대시보드) */
export class RecentNoticeResponse {
    id: number;

    boardId: number;

    title: string;

    isPinned: boolean;

    createdAt: Date;

    board: BoardNameResponse;
}

/** 일정을 조회한 캘린더 게시판 */
export class CalendarBoardResponse {
    id: number;

    name: string;

    showLeaves: boolean;
}

/** 일정 하나 */
export class CalendarEventResponse extends PostEventFields {
    /** 게시글 id */
    id: number;

    boardId: number;

    title: string;

    isSecret: boolean;

    author: PostAuthorResponse | null;
}

/** 캘린더 일정 */
export class CalendarEventsResponse {
    /** 조회한 캘린더 게시판 */
    boards: CalendarBoardResponse[];

    /** 휴가자를 함께 표시할지 (조회한 게시판 중 하나라도 켜져 있으면 true) */
    showLeaves: boolean;

    events: CalendarEventResponse[];
}
