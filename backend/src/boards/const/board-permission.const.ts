import { BoardPermission } from "../interface/board-permission.interface";

// 시스템 관리자 (규칙과 관계없이 모든 권한)
export const ALL_PERMISSION: BoardPermission = {
    read: true,
    write: true,
    comment: true,
    admin: true,
};

// 해당하는 규칙이 없을 때 (기본 거부)
export const NO_PERMISSION: BoardPermission = {
    read: false,
    write: false,
    comment: false,
    admin: false,
};

// 권한 판정에 쓰는 규칙 조회 모양 (BoardRule interface와 같아야 한다)
export const boardRuleSelect = {
    boardId: true,
    departmentId: true,
    includeSubDepartment: true,
    position: { select: { sortOrder: true } },
    jobTitles: { select: { jobTitleId: true } },
    authRead: true,
    authWrite: true,
    authComment: true,
    authAdmin: true,
} as const;
