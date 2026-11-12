// 백엔드 approvals/leaves/leave-grants.controller 대응 (/approvals/leaves/grants, ADMIN)
// 휴가 옵션(leaves)이 꺼져 있으면 API가 없다(404). 호출하는 화면에서 useEnabledAddons로 먼저 확인한다.
import { apiFetch } from "@/services/api-client";

export interface LeaveRecalculateResult {
  year: number; // 올해
  count: number; // 올해 다시 계산한 회원 수
  asOf: string; // 기준일 "YYYY-MM-DD" (오늘, KST)
  years: { year: number; count: number }[]; // 계산한 연도별 인원 (12월이면 다음 해 포함)
}

// 지금 재계산: 오늘 기준 올해(12월이면 다음 해도) 연차 부여(계산값)를 다시 계산한다. 관리자 조정값은 유지된다.
export function recalculateLeaveGrants() {
  return apiFetch<LeaveRecalculateResult>("/approvals/leaves/grants/recalculate", { method: "POST" });
}
