//! 전자결재 상수 (features.md 7.5)

// 결재라인 결재자 수 (템플릿·문서 공통)
export const MAX_APPROVAL_STEPS = 10;

// 알림 link (프론트 주소)
export const approvalDocumentLink = ( id: number ) => `/approvals/${id}`;

//* 결재함 구분 (GET /approvals/documents?box=)
export enum ApprovalBox {
    DRAFTS = 'drafts',          // 임시저장: 내가 기안자, DRAFT
    MINE = 'mine',              // 기안함: 내가 기안자, DRAFT 제외 전부
    PENDING = 'pending',        // 결재 대기: 내 단계가 PENDING (지금 내 차례)
    UPCOMING = 'upcoming',      // 결재 예정: 내 단계가 WAITING이고 문서가 진행 중 (아직 내 차례가 아님)
    PROCESSED = 'processed',    // 결재 완료: 내 단계가 APPROVED·REJECTED (내가 처리함)
    ALL = 'all',                // 전체 문서: 관리자, DRAFT 제외
}

// 동시 처리(두 탭·더블 클릭·회수와 승인이 겹침 등)로 조건부 UPDATE가 0행일 때
export const STATE_CHANGED_MESSAGE = '문서 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.';
