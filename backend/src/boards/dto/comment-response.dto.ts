import { PostAuthorResponse } from './post-response.dto';

//* 댓글 응답 (Swagger 문서용 클래스)

/** 내가 할 수 있는 동작 (버튼 표시용) */
export class CommentCanResponse {
    /** 수정: 작성자만 */
    edit: boolean;

    /** 삭제: 작성자 또는 게시판 관리 권한 */
    delete: boolean;
}

/** 댓글 목록 한 줄 (트리 순서의 평평한 목록) */
export class CommentItemResponse {
    id: number;

    /** 부모 댓글 id (최상위는 null) */
    parentCommentId: number | null;

    /** 트리 깊이 (최상위 0, 대댓글 깊이 제한 없음) */
    depth: number;

    /** 삭제된 댓글 (답글이 남아 있어 자리만 남긴 경우 comment·작성자가 null) */
    deleted: boolean;

    /** 내용 (삭제된 댓글은 null) */
    comment: string | null;

    /** 작성자 (삭제된 댓글, 익명 게시판의 다른 사람 댓글은 null) */
    author: PostAuthorResponse | null;

    authorDepartmentName: string | null;

    authorJobTitleName: string | null;

    authorPositionName: string | null;

    createdAt: Date;

    updatedAt: Date;

    can: CommentCanResponse;

    /** 트리 경로 (댓글은 이름이 없어 빈 문자열, 삭제된 댓글 행에는 없다) */
    path?: string;
}

/** 댓글 행 (작성·수정 결과) */
export class CommentResponse {
    id: number;

    postId: number;

    parentCommentId: number | null;

    authorId: number;

    comment: string;

    authorDepartmentName: string | null;

    authorJobTitleName: string | null;

    authorPositionName: string | null;

    createdAt: Date;

    createdId: number;

    updatedAt: Date;

    updatedId: number;

    deleted: boolean;

    deletedAt: Date | null;

    deletedId: number | null;
}
