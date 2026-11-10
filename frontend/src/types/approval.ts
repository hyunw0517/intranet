// 전자결재 응답 타입 (백엔드 src/approvals/*, docs/backend/approvals.md)
import type { FileInfo } from "./file";

export type ApprovalStatus = "DRAFT" | "CANCELLED" | "REQUESTED" | "IN_PROGRESS" | "APPROVED" | "REJECTED";
export type ApprovalStepStatus = "WAITING" | "PENDING" | "APPROVED" | "REJECTED";
export type ApprovalDocumentType = "GENERAL" | "LEAVE";
export type ApprovalLineScope = "ADMIN" | "DEPARTMENT" | "PERSONAL";
export type LineManagerScope = "ALL" | "DEPARTMENT" | "MY_DEPARTMENT";

// 결재함 (GET /approvals/documents?box=)
export type ApprovalBox = "pending" | "upcoming" | "drafts" | "mine" | "processed" | "all";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: "임시저장",
  CANCELLED: "회수",
  REQUESTED: "결재요청",
  IN_PROGRESS: "결재중",
  APPROVED: "승인",
  REJECTED: "반려",
};

export const STEP_STATUS_LABEL: Record<ApprovalStepStatus, string> = {
  WAITING: "대기",
  PENDING: "결재 차례",
  APPROVED: "승인",
  REJECTED: "반려",
};

export const DOCUMENT_TYPE_LABEL: Record<ApprovalDocumentType, string> = {
  GENERAL: "일반 문서",
  LEAVE: "휴가 신청",
};

export const LINE_SCOPE_LABEL: Record<ApprovalLineScope, string> = {
  ADMIN: "공용",
  DEPARTMENT: "부서",
  PERSONAL: "개인",
};

export const LINE_MANAGER_SCOPE_LABEL: Record<LineManagerScope, string> = {
  ALL: "전체 (공용 + 모든 부서)",
  DEPARTMENT: "특정 부서",
  MY_DEPARTMENT: "본인 부서",
};

// 결재자 (검색 결과·템플릿 단계의 현재 정보)
export interface Approver {
  id: number;
  name: string;
  empNo: string;
  departmentName: string | null;
  positionName: string | null;
  jobTitleName: string | null;
  usable: boolean; // 재직 + USER/ADMIN (결재자로 지정 가능)
}

// 결재라인 템플릿
export interface ApprovalLineStep {
  stepOrder: number;
  name: string | null;
  approverId: number;
  approverName: string | null;
  departmentName: string | null;
  positionName: string | null;
  jobTitleName: string | null;
  usable: boolean; // 삭제·퇴사한 결재자는 false → 불러올 때 뺀다
}

export interface ApprovalLine {
  id: number;
  name: string;
  scope: ApprovalLineScope;
  department: { id: number; name: string; deleted: boolean } | null;
  updatedAt: string;
  steps: ApprovalLineStep[];
}

// 내 결재라인 관리 범위 (GET /approvals/line-managers/me)
export interface LineManageScope {
  all: boolean;
  departmentIds: number[];
  // 관리할 수 있는 부서 (맡은 부서 + 하위 부서 전체, 트리 순서). path = 최상위부터의 이름 (구분자 /)
  departments: { id: number; name: string; parentDepartmentId: number | null; sortOrder: number; depth: number; path: string }[];
}

// 결재라인 관리자 규칙 (ADMIN)
export interface LineManagerRule {
  id: number;
  scope: LineManagerScope;
  createdAt: string;
  user: { id: number; name: string; empNo: string; status: string; deleted: boolean } | null;
  jobTitle: { id: number; name: string; deleted: boolean } | null;
  department: { id: number; name: string; deleted: boolean } | null;
  inactive: boolean; // 판정에 쓰이지 않는 규칙 (대상 퇴사·삭제, 직책·부서 삭제)
}

// 결재함 목록 항목
export interface ApprovalListItem {
  id: number;
  documentType: ApprovalDocumentType;
  title: string;
  status: ApprovalStatus;
  currentStepOrder: number | null;
  requestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: { id: number; name: string };
  steps: { stepOrder: number; approverId: number; approverName: string; status: ApprovalStepStatus; actedAt: string | null }[];
  myStep?: { status: ApprovalStepStatus; actedAt: string | null }; // 결재 완료함만
}

// 문서 단계 (결재 당시 스냅샷)
export interface ApprovalDocumentStep {
  id: number;
  stepOrder: number;
  approverId: number;
  status: ApprovalStepStatus;
  comment: string | null;
  actedAt: string | null;
  approverName: string;
  departmentName: string | null;
  positionName: string | null;
  jobTitleName: string | null;
  approverUsable: boolean | null; // 남은 단계만: 지금도 결재할 수 있는지 (false → "결재자 확인 필요", 관리자 교체)
}

export interface ApprovalHistory {
  id: string; // BigInt → 문자열
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus;
  comment: string | null;
  createdAt: string;
  actor: { id: number; name: string } | null;
}

export interface ApprovalDocument {
  id: number;
  documentType: ApprovalDocumentType;
  title: string;
  content: string | null;
  status: ApprovalStatus;
  currentStepOrder: number | null;
  requestedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: { id: number; name: string; empNo: string };
  sourceTemplate: { id: number; name: string } | null;
  steps: ApprovalDocumentStep[];
  histories: ApprovalHistory[];
  files: FileInfo[];
  permissions: {
    canEdit: boolean; // 수정·삭제·상신 (기안자, 임시저장)
    canCancel: boolean; // 회수 (기안자, 결재요청)
    canApprove: boolean; // 승인·반려 (내 차례)
    canCopy: boolean; // 다시 기안 (기안자, 반려·회수)
    canReplaceApprover: boolean; // 결재자 교체 (관리자, 진행 중)
  };
}
