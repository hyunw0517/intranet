// 백엔드 approvals/leaves/leave-grants.controller 대응 (/approvals/leaves/grants, ADMIN)
// 휴가 옵션(leaves)이 꺼져 있으면 API가 없다(404). 호출하는 화면에서 useEnabledAddons로 먼저 확인한다.
import { apiFetch } from "@/services/api-client";
import type { LeaveGrantRow, LeaveSummary } from "@/types/leave";
import type { PageResult } from "@/types/pagination";

export interface LeaveRecalculateResult {
  year: number; // 올해
  count: number; // 올해 다시 계산한 회원 수
  asOf: string; // 기준일 "YYYY-MM-DD" (오늘, KST)
  years: { year: number; count: number }[]; // 계산한 연도별 인원 (12월이면 다음 해 포함)
}

export interface LeaveGrantListQuery {
  year?: number; // 비우면 올해
  search?: string; // 이름·사번
  page?: number;
  take?: number;
}

// 연차 현황 (그 연도 부여 행이 있는 회원, 이름 순)
export function fetchLeaveGrants(query: LeaveGrantListQuery) {
  return apiFetch<PageResult<LeaveGrantRow>>("/approvals/leaves/grants", { query: { ...query } });
}

// 지금 재계산: 오늘 기준 올해(12월이면 다음 해도) 연차 부여(계산값)를 다시 계산한다. 관리자 조정값은 유지된다.
export function recalculateLeaveGrants() {
  return apiFetch<LeaveRecalculateResult>("/approvals/leaves/grants/recalculate", { method: "POST" });
}

// 조정 저장 (0.25 단위, 값이 0이 아니면 사유 필수) - year를 비우면 올해, 다음 해는 12월에 행이 생긴 뒤
// - 영구 조정값: 매년 더함, 저장하면 올해부터 반영(입사한 해 제외, 지난 연도는 그대로)
// - 매년 조정값: 그 연도에만 (새해에는 0으로 시작)
export interface AdjustLeaveGrantInput {
  year?: number;
  permanentDays: number;
  permanentReason: string | null;
  adjustDays: number;
  adjustReason: string | null;
}

export function adjustLeaveGrant(userId: number, input: AdjustLeaveGrantInput) {
  return apiFetch<LeaveSummary>(`/approvals/leaves/grants/${userId}`, { method: "PATCH", body: input });
}
