// 백엔드 approvals/line-managers.controller 대응 (/approvals/line-managers)
// 결재라인 관리자 = 공용·부서 결재라인을 관리할 수 있는 사람 (Role.ADMIN과 별개 위임 권한)
import { apiFetch } from "@/services/api-client";
import type { LineManagerRule, LineManagerScope, LineManageScope } from "@/types/approval";

// 내 관리 범위 (전원) - 관리 메뉴·버튼 표시, 부서 선택지
export function fetchMyLineScope() {
  return apiFetch<LineManageScope>("/approvals/line-managers/me");
}

// 규칙 목록 (ADMIN)
export function fetchLineManagers() {
  return apiFetch<LineManagerRule[]>("/approvals/line-managers");
}

// 대상: userId / jobTitleId 중 하나. DEPARTMENT는 departmentId 필요, MY_DEPARTMENT는 직책 대상만 (같은 규칙 409)
export interface LineManagerInput {
  userId?: number;
  jobTitleId?: number;
  scope: LineManagerScope;
  departmentId?: number;
}

export function createLineManager(input: LineManagerInput) {
  return apiFetch<unknown>("/approvals/line-managers", { method: "POST", body: input });
}

// 해제 (수정은 없다)
export function deleteLineManager(id: number) {
  return apiFetch<void>(`/approvals/line-managers/${id}`, { method: "DELETE" });
}
