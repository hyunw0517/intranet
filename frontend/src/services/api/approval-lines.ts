// 백엔드 approvals/approval-lines.controller 대응 (/approvals/lines)
// 공용·부서 라인은 결재라인 관리자만(403), 남의 개인 라인은 404
import { apiFetch } from "@/services/api-client";
import type { ApprovalLine, ApprovalLineScope, LineManageScope } from "@/types/approval";

// 내가 불러올 수 있는 템플릿 (공용 + 내 부서 + 내 개인)
export function fetchUsableLines() {
  return apiFetch<ApprovalLine[]>("/approvals/lines");
}

// 내가 관리할 수 있는 공용·부서 템플릿 (권한 없으면 403)
export function fetchManageableLines() {
  return apiFetch<{ scope: Omit<LineManageScope, "departments">; lines: ApprovalLine[] }>("/approvals/lines/manage");
}

// 배열 순서 = 결재 순서
export interface ApprovalLineInput {
  name: string;
  steps: { approverId: number; name?: string | null }[];
}

export function createApprovalLine(input: ApprovalLineInput & { scope: ApprovalLineScope; departmentId?: number }) {
  return apiFetch<ApprovalLine>("/approvals/lines", { method: "POST", body: input });
}

// 이름·단계 전체 교체 (scope·부서는 바꿀 수 없다)
export function updateApprovalLine(id: number, input: ApprovalLineInput) {
  return apiFetch<ApprovalLine>(`/approvals/lines/${id}`, { method: "PATCH", body: input });
}

export function deleteApprovalLine(id: number) {
  return apiFetch<void>(`/approvals/lines/${id}`, { method: "DELETE" });
}
