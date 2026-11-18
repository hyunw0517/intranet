// 감사 로그 (GET /common/audit-logs) - 백엔드 enum AuditActionType·AuditTargetType과 같은 값
import type { AddonName } from "@/services/api/addons";

export const AUDIT_ACTION_LABEL = {
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
  RESTORE: "복구",
  ROLE_CHANGE: "권한 변경",
  STATUS_CHANGE: "상태 변경",
  LOGIN: "로그인",
  LOGIN_FAILED: "로그인 실패",
  LOGOUT: "로그아웃",
  PASSWORD_CHANGE: "비밀번호 변경",
  PASSWORD_RESET: "비밀번호 초기화",
  TOKEN_REUSE: "토큰 재사용 감지",
  LOGIN_LOCKED: "로그인 잠금",
  LOGIN_UNLOCKED: "로그인 잠금 해제",
} as const;
export type AuditActionType = keyof typeof AUDIT_ACTION_LABEL;
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABEL) as AuditActionType[];

// addon이 있는 대상은 그 애드온이 켜져 있을 때만 필터에 보인다. (백엔드 audit-target-addon.const.ts와 같은 규칙)
export const AUDIT_TARGETS = {
  USER: { label: "회원" },
  AUTH_SESSION: { label: "로그인 세션" },
  DEPARTMENT: { label: "부서" },
  POSITION: { label: "직급" },
  JOB_TITLE: { label: "직책" },
  USER_DEPARTMENT: { label: "회원 소속" },
  BOARD: { label: "게시판" },
  BOARD_AUTH: { label: "게시판 권한" },
  POST: { label: "게시글" },
  COMMENT: { label: "댓글" },
  FILE: { label: "파일" },
  FACILITY_CATEGORY: { label: "시설 분류", addon: "reservations" },
  FACILITY: { label: "시설", addon: "reservations" },
  FACILITY_RESERVATION: { label: "시설 예약", addon: "reservations" },
  APPROVAL_LINE: { label: "결재라인", addon: "approvals" },
  APPROVAL_LINE_MANAGER: { label: "결재라인 관리자", addon: "approvals" },
  APPROVAL: { label: "전자결재", addon: "approvals" },
  LEAVE: { label: "휴가", addon: "leaves" },
  CHAT_ROOM: { label: "채팅방", addon: "chats" },
  PROJECT_CLIENT: { label: "거래처", addon: "projects" },
  PROJECT_CLIENT_CONTACT: { label: "거래처 담당자", addon: "projects" },
  PROJECT: { label: "프로젝트", addon: "projects" },
  PROJECT_MEMBER: { label: "프로젝트 참여자", addon: "projects" },
  PROJECT_TASK: { label: "과제", addon: "projects" },
  PROJECT_PARTNER: { label: "협력사", addon: "projects" },
  PROJECT_QUOTE: { label: "견적서", addon: "projects" },
  PROJECT_SALE: { label: "매출", addon: "projects" },
  PROJECT_BUDGET_CATEGORY: { label: "비용 항목", addon: "projects" },
  PROJECT_BUDGET: { label: "예산", addon: "projects" },
  PROJECT_EXPENSE: { label: "지출", addon: "projects" },
} as const satisfies Record<string, { label: string; addon?: AddonName }>;
export type AuditTargetType = keyof typeof AUDIT_TARGETS;
export const AUDIT_TARGET_TYPES = Object.keys(AUDIT_TARGETS) as AuditTargetType[];

export interface AuditLog {
  id: string; // BigInt → 문자열
  targetType: AuditTargetType | null;
  targetId: number | null;
  actionType: AuditActionType;
  content: string | null;
  detail: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: number; name: string; empNo: string } | null; // 로그인 실패 등 작업자가 없으면 null
}
