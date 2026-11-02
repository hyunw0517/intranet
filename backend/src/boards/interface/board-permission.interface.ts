import { BoardType } from "src/generated/prisma/client";

// 권한 구분용 인터페이스
export interface BoardPermission {
    read: boolean;
    write: boolean;
    comment: boolean;
    admin: boolean;
}

export type BoardAction = keyof BoardPermission;

// assertBoardPermission 반환값: 판정한 권한 + 이미 조회한 게시판 정보
// 게시글 서비스가 게시판 설정(비밀글 허용, 타입 등)을 다시 조회하지 않도록 함께 돌려준다.
export interface BoardAccess {
    board: {
        id: number;
        type: BoardType;
        name: string;
        description: string | null;
        allowSecret: boolean;   // 비밀글 허용 여부
        isAnonymous: boolean;   // 익명 게시판 여부
    };
    perm: BoardPermission;
}
