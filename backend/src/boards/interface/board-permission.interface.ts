import { BoardType } from "src/generated/prisma/client";

// 권한 구분용 인터페이스
export interface BoardPermission {
    read: boolean;
    write: boolean;
    comment: boolean;
    admin: boolean;
}

export type BoardAction = keyof BoardPermission;

// assertBoardPermission 반환값 (권한 + 이미 읽은 게시판 정보)
export interface BoardAccess {
    board: {
        id: number;
        type: BoardType;
        name: string;
        description: string | null;
        allowSecret: boolean;   // 비밀글 허용 여부
        isAnonymous: boolean;   // 익명 게시판 여부
        showLeaves: boolean;    // 휴가자 표시 (캘린더 게시판)
    };
    perm: BoardPermission;
}
