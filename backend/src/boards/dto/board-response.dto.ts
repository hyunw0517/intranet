import { ApiProperty } from '@nestjs/swagger';
import { NamedRefResponse } from 'src/users/dto/user-response.dto';
import { BoardType } from 'src/generated/prisma/client';

//* 게시판·게시판 권한 응답 (Swagger 문서용 클래스)

/** 게시판 기본 정보 (권한 검사 결과와 함께 내려간다) */
export class BoardInfoResponse {
    id: number;

    @ApiProperty({ enum: BoardType, enumName: 'BoardType' })
    type: BoardType;

    name: string;

    description: string | null;

    /** 비밀글 허용 */
    allowSecret: boolean;

    /** 익명 게시판 (다른 사람 글의 작성자를 가린다) */
    isAnonymous: boolean;

    /** 휴가자 표시 (캘린더 게시판만) */
    showLeaves: boolean;
}

/** 내 게시판 권한 (버튼 표시용, 실제로 막는 것은 각 API의 검사) */
export class BoardPermResponse {
    read: boolean;

    write: boolean;

    comment: boolean;

    /** 게시판 관리 (다른 사람 글·댓글 삭제, 글 고정) */
    admin: boolean;
}

/** 게시판 정보 + 내 권한 */
export class BoardWithPermResponse {
    board: BoardInfoResponse;

    perm: BoardPermResponse;
}

/** 게시판 행 (생성·수정 결과) */
export class BoardResponse {
    id: number;

    /** 상위 게시판 id (최상위는 null) */
    parentBoardId: number | null;

    @ApiProperty({ enum: BoardType, enumName: 'BoardType' })
    type: BoardType;

    name: string;

    description: string | null;

    isAnonymous: boolean;

    allowSecret: boolean;

    showLeaves: boolean;

    /** 형제 게시판 사이 순서 (0부터) */
    sortOrder: number;

    createdAt: Date;

    createdId: number;

    updatedAt: Date;

    updatedId: number;

    deleted: boolean;

    deletedAt: Date | null;

    deletedId: number | null;
}

/** 내비게이션 게시판 한 줄 (트리 순서의 평평한 목록) */
export class BoardNavItemResponse {
    id: number;

    parentBoardId: number | null;

    @ApiProperty({ enum: BoardType, enumName: 'BoardType' })
    type: BoardType;

    name: string;

    description: string | null;

    sortOrder: number;

    /** 트리 깊이 (최상위 0) */
    depth: number;

    /** 최상위부터 자기까지의 이름 (구분자 /) */
    path: string;
}

/** (관리자) 게시판 목록 한 줄 */
export class AdminBoardItemResponse extends BoardNavItemResponse {
    isAnonymous: boolean;

    allowSecret: boolean;

    showLeaves: boolean;

    /** 게시글 수 */
    postCount: number;

    /** 권한 규칙 수 (0이면 관리자만 볼 수 있다) */
    authCount: number;
}

/** 직급 (권한 규칙의 최소 직급) */
export class BoardAuthPositionResponse extends NamedRefResponse {
    /** 직급 순위 (작을수록 높음) */
    sortOrder: number;
}

/** 게시판 권한 규칙 */
export class BoardAuthResponse {
    id: number;

    boardId: number;

    /** 부서 조건 (null이면 부서 조건 없음) */
    departmentId: number | null;

    /** 하위 부서 포함 */
    includeSubDepartment: boolean;

    /** 최소 직급 조건 (null이면 직급 조건 없음) */
    positionId: number | null;

    /** 다른 사람이 작성한 게시글·댓글 삭제, 글 고정 */
    authAdmin: boolean;

    authRead: boolean;

    authWrite: boolean;

    authComment: boolean;

    department: NamedRefResponse | null;

    position: BoardAuthPositionResponse | null;

    /** 허용 직책 (비어 있으면 직책 조건 없음) */
    jobTitles: NamedRefResponse[];
}

/** 생성된 행의 id */
export class CreatedIdResponse {
    id: number;
}
