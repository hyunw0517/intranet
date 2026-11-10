// 백엔드 approvals/approvers.controller 대응 (/approvals/approvers)
import { apiFetch } from "@/services/api-client";
import type { Approver } from "@/types/approval";

// 결재자 후보 검색: 지정할 수 있는 회원(재직 + 직원·관리자)만, 이름·사번·부서명, 최대 20명
export function searchApprovers(search: string) {
  return apiFetch<Approver[]>("/approvals/approvers", { query: { search: search || undefined } });
}
