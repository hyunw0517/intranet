import { AddonName } from "src/config/addons.config";
import { AuditTargetType } from "src/generated/prisma/client";

//* 감사 로그 대상 → 그 대상을 기록하는 애드온 (null = 핵심 모듈)
// 꺼진 애드온의 로그는 조회에서 제외한다. 데이터는 지우지 않으므로 다시 켜면 그대로 보인다. (2026-11-18 사용자 결정)
// Record로 선언해 AuditTargetType에 값이 추가되면 여기를 채우지 않았을 때 컴파일 오류가 난다.
export const AUDIT_TARGET_ADDON: Record<AuditTargetType, AddonName | null> = {
    USER: null,
    AUTH_SESSION: null,
    DEPARTMENT: null,
    POSITION: null,
    JOB_TITLE: null,
    USER_DEPARTMENT: null,
    BOARD: null,
    BOARD_AUTH: null,
    POST: null,
    COMMENT: null,
    FILE: null,
    FACILITY_CATEGORY: 'reservations',
    FACILITY: 'reservations',
    FACILITY_RESERVATION: 'reservations',
    APPROVAL_LINE: 'approvals',
    APPROVAL_LINE_MANAGER: 'approvals',
    APPROVAL: 'approvals',
    LEAVE: 'leaves',
    CHAT_ROOM: 'chats',
    PROJECT_CLIENT: 'projects',
    PROJECT_CLIENT_CONTACT: 'projects',
    PROJECT: 'projects',
    PROJECT_MEMBER: 'projects',
    PROJECT_TASK: 'projects',
    PROJECT_PARTNER: 'projects',
    PROJECT_QUOTE: 'projects',
    PROJECT_SALE: 'projects',
    PROJECT_BUDGET_CATEGORY: 'projects',
    PROJECT_BUDGET: 'projects',
    PROJECT_EXPENSE: 'projects',
};
