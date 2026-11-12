// 휴가 옵션(leaves) 응답 타입 - 백엔드 approvals/leaves (docs/backend/leaves.md)
import type { ApprovalStatus } from "./approval";

export type LeaveType = "ANNUAL" | "SICK" | "OFFICIAL";
export type LeaveUnit = "FULL" | "HALF" | "QUARTER";

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { ANNUAL: "연차", SICK: "병가", OFFICIAL: "공가" };
export const LEAVE_UNIT_LABEL: Record<LeaveUnit, string> = { FULL: "종일", HALF: "반차", QUARTER: "반반차" };

// 휴가 신청 정보 (GET /approvals/leaves/documents/:id, POST·PATCH 응답, 내 목록 항목)
// 날짜는 "YYYY-MM-DD", 시각은 "HH:mm"(종일이면 null), 일수는 0.25 단위
export interface LeaveInfo {
  id: number;
  documentId: number;
  type: LeaveType;
  typeLabel: string;
  unit: LeaveUnit;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  days: number;
  reason: string | null;
  documentStatus: ApprovalStatus;
}

// 내 목록 항목은 결재 문서 제목도 함께 온다
export interface MyLeaveItem extends LeaveInfo {
  title: string;
}

// 연차 현황 (GET /approvals/leaves/me, 관리자 목록 항목)
// 부여 = 계산값 + 영구 조정값 + 매년 조정값(25일 한도 없음), 잔여 = 부여 − 사용 − 결재 중 (관리자 조정으로 음수 가능)
export interface LeaveSummary {
  year: number;
  hasGrant: boolean; // 그 연도 부여 행이 있는지 (없으면 부여 0)
  baseDays: number; // 규칙 계산값
  permanentDays: number; // 그해에 적용된 영구 조정값 (입사한 해는 0)
  adjustDays: number; // 매년 초기화되는 조정값
  adjustReason: string | null;
  grantedDays: number;
  usedDays: number;
  inProgressDays: number;
  remainingDays: number;
}

// 관리자 연차 현황 항목
export interface LeaveGrantRow extends LeaveSummary {
  user: { id: number; empNo: string; name: string; joinAt: string | null; status: "ACTIVE" | "INACTIVE" | "RESIGNED" };
  permanentSetting: { days: number; reason: string | null }; // 회원 설정의 영구 조정값 (조정 창 기본값)
}

// 캘린더 휴가자 (GET /approvals/leaves/calendar) - 최종 승인된 휴가만, 유형은 오지 않는다
export interface LeaveCalendarPerson {
  leaveId: number;
  userId: number;
  name: string;
  departmentName: string | null;
  positionName: string | null;
  unit: LeaveUnit;
  startTime: string | null;
  endTime: string | null;
}

export interface LeaveCalendarDay {
  date: string; // "YYYY-MM-DD"
  count: number; // 그날 사람 수 (같은 사람의 반차 두 건은 1명)
  people: LeaveCalendarPerson[];
}
