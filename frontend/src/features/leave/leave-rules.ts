// 휴가 입력 화면 규칙 (features.md 7.4 "휴가 신청 규칙") - 최종 판단은 서버(leave-request.util.ts)가 한다.
// 화면에서는 입력을 돕고 미리 보여 주는 용도로만 같은 계산을 한다.
import type { LeaveType, LeaveUnit } from "@/types/leave";

export const REASON_MAX = 500;

// 반차·반반차 길이 (분) - 종료 = 시작 + 길이
const PARTIAL_MINUTES: Record<Exclude<LeaveUnit, "FULL">, number> = { HALF: 240, QUARTER: 120 };
// 하루에 쓰는 일수
const UNIT_DAYS: Record<LeaveUnit, number> = { FULL: 1, HALF: 0.5, QUARTER: 0.25 };

export interface LeaveFormValues {
  type: LeaveType;
  unit: LeaveUnit;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // 종일만 사용
  startTime: string; // 반차·반반차만 사용 "HH:mm"
  reason: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

// 오늘 (KST) "YYYY-MM-DD"
export function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function thisYearKst() {
  return Number(todayKst().slice(0, 4));
}

export function emptyLeaveForm(): LeaveFormValues {
  const today = todayKst();
  return { type: "ANNUAL", unit: "FULL", startDate: today, endDate: today, startTime: "09:00", reason: "" };
}

// 두 날짜 사이 일수 (양 끝 포함)
function daysInclusive(start: string, end: string) {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1;
}

// 시작 시각 선택지: 30분 단위, 그날 안에 끝나는 시각까지 (반차 20:00, 반반차 22:00)
export function startTimeOptions(unit: Exclude<LeaveUnit, "FULL">) {
  const last = 24 * 60 - PARTIAL_MINUTES[unit];
  const options: string[] = [];
  for (let m = 0; m <= last; m += 30) options.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return options;
}

// 반차·반반차 종료 시각 (서버와 같은 계산)
export function partialEndTime(unit: Exclude<LeaveUnit, "FULL">, startTime: string) {
  const [h, m] = startTime.split(":").map(Number);
  const end = h * 60 + m + PARTIAL_MINUTES[unit];
  return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

// 입력 검사 → 오류 문구 (없으면 null)
export function validateLeave(v: LeaveFormValues): string | null {
  if (!v.startDate) return "시작일을 입력하세요.";
  if (v.unit === "FULL") {
    if (!v.endDate) return "종료일을 입력하세요.";
    if (v.endDate < v.startDate) return "종료일이 시작일보다 빠릅니다.";
    if (v.endDate.slice(0, 4) !== v.startDate.slice(0, 4)) return "연도를 걸치는 휴가는 연도별로 나눠 신청하세요.";
  } else if (!v.startTime) {
    return "시작 시각을 고르세요.";
  }
  if (v.reason.length > REASON_MAX) return `사유는 ${REASON_MAX}자 이하로 입력하세요.`;
  return null;
}

// 사용 일수 미리보기 (종일 = 달력 일수)
export function previewDays(v: LeaveFormValues): number | null {
  if (validateLeave(v)) return null;
  return v.unit === "FULL" ? daysInclusive(v.startDate, v.endDate) : UNIT_DAYS[v.unit];
}

// 기간·시각 한 줄 표시 ("2026-12-01 ~ 2026-12-03" / "2026-12-01 09:00~13:00")
export function formatLeavePeriod(p: { unit: LeaveUnit; startDate: string; endDate: string; startTime: string | null; endTime: string | null }) {
  if (p.unit !== "FULL") return `${p.startDate} ${p.startTime}~${p.endTime}`;
  return p.startDate === p.endDate ? p.startDate : `${p.startDate} ~ ${p.endDate}`;
}

// 일수 표시 (0.25 단위, 음수 가능)
export function formatDays(days: number) {
  return `${Number.isInteger(days) ? days : days.toFixed(2).replace(/0$/, "")}일`;
}
