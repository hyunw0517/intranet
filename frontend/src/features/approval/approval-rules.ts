// 전자결재 화면 규칙 (서버 규칙과 같게 - 최종 판단은 서버, features.md 7.5)

export const MAX_APPROVAL_STEPS = 10; // 백엔드 MAX_APPROVAL_STEPS
export const TITLE_MAX = 200; // CreateApprovalDocumentDto @MaxLength(200)
export const LINE_NAME_MAX = 100;
export const COMMENT_MAX = 1000;

// 알림 link와 같은 주소 (백엔드 approvalDocumentLink)
export const approvalHref = (id: number) => `/approvals/${id}`;
