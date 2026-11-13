// 백엔드 approvals/leaves/leaves.controller 대응 (/approvals/leaves)
// 휴가 옵션(leaves)이 꺼져 있으면 API가 없다(404). 화면은 useEnabledAddons로 먼저 확인한다.
// 상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API(approval-documents.ts)를 그대로 쓴다.
import { apiFetch } from "@/services/api-client";
import type { CalendarRange } from "@/services/api/calendar";
import type { LeaveCalendarDay, LeaveInfo, LeaveSummary, LeaveType, LeaveUnit, MyLeaveItem } from "@/types/leave";

// 휴가 항목 + 결재 문서 항목 (제목은 서버가 유형·기간으로 만든다)
export interface LeaveInput {
  type: LeaveType;
  unit: LeaveUnit;
  startDate: string; // "YYYY-MM-DD"
  endDate?: string | null; // 종일만 (비우면 하루)
  startTime?: string | null; // 반차·반반차만 "HH:mm" (30분 단위, 종료는 서버가 채움)
  reason?: string | null;
  steps: { approverIds: number[] }[];
  approvalLineTemplateId?: number | null;
  attachmentIds: number[];
}

// 내 연차 현황 (year를 비우면 올해)
export function fetchMyLeaveSummary(year?: number) {
  return apiFetch<LeaveSummary>("/approvals/leaves/me", { query: { year } });
}

// 내 휴가 신청 목록 (그 연도, 임시저장·반려·회수 포함)
export function fetchMyLeaves(year?: number) {
  return apiFetch<MyLeaveItem[]>("/approvals/leaves", { query: { year } });
}

// 휴가 신청 임시저장 → 응답의 documentId로 상신
export function createLeave(input: LeaveInput) {
  return apiFetch<LeaveInfo>("/approvals/leaves", { method: "POST", body: input });
}

// 결재 문서에 딸린 휴가 정보 (문서 열람 권한과 같다)
export function fetchLeaveByDocument(documentId: number) {
  return apiFetch<LeaveInfo>(`/approvals/leaves/documents/${documentId}`);
}

// 임시저장 수정 (기안자, 임시저장만)
export function updateLeave(documentId: number, input: LeaveInput) {
  return apiFetch<LeaveInfo>(`/approvals/leaves/documents/${documentId}`, { method: "PATCH", body: input });
}

// 캘린더 휴가자 - 게시판 캘린더와 같은 기간 형식 (전 직원, 최종 승인된 휴가만)
export function fetchLeaveCalendar(range: CalendarRange) {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  return apiFetch<LeaveCalendarDay[]>(`/approvals/leaves/calendar?${params}`);
}
