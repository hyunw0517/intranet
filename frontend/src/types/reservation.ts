// 시설 예약 공통 타입 (백엔드 reservations 모듈의 JSON 응답 기준, 시각은 UTC ISO 문자열)
// 규칙 원본: docs/design/features.md 6장, API: docs/backend/reservations.md

export type ReservationStatus = "RESERVED" | "CANCELLED";

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  RESERVED: "예약됨",
  CANCELLED: "취소됨",
};

// ISO 요일 (1 = 월 … 7 = 일)
export const WEEKDAY_LABEL = ["", "월", "화", "수", "목", "금", "토", "일"] as const;

// 분류가 정하는 예약 규칙 (시각은 자정부터 분)
export interface ReservationRules {
  slotMinutes: number;
  openMinute: number;
  closeMinute: number;
  operatingDays: number[];
  maxAdvanceDays: number;
}

// GET /reservations/categories 한 행 (운영 시간을 "HH:mm"으로도 준다)
export interface FacilityCategory extends ReservationRules {
  id: number;
  name: string;
  sortOrder: number;
  openTime: string;
  closeTime: string;
}

// 시설 목록·상세 (분류 규칙 포함)
export interface Facility {
  id: number;
  categoryId: number;
  name: string;
  location: string | null;
  capacity: number | null;
  description: string | null;
  isActive: boolean;
  category: Pick<FacilityCategory, "id" | "name" | "sortOrder"> & ReservationRules;
}

// 예약 목록·상세
export interface Reservation {
  id: number;
  facilityId: number;
  userId: number;
  title: string | null;
  description: string | null;
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  createdAt: string;
  facility: { id: number; name: string; category: { id: number; name: string } };
  user: { id: number; name: string };
}

// 시간표 (GET /reservations/schedule)
export interface ScheduleReservation {
  id: number;
  facilityId: number;
  startAt: string;
  endAt: string;
  title: string | null;
  user: { id: number; name: string };
  isMine: boolean;
}

export interface ScheduleUnavailable {
  id: number;
  facilityId: number;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface ScheduleResult {
  facilities: { id: number; name: string; location: string | null; capacity: number | null; categoryId: number }[];
  reservations: ScheduleReservation[];
  unavailable: ScheduleUnavailable[];
}

// 반복 예약 결과
export type RecurringSkipReason = "RESERVED" | "UNAVAILABLE" | "NOT_OPERATING_DAY" | "PAST";

export const SKIP_REASON_LABEL: Record<RecurringSkipReason, string> = {
  RESERVED: "이미 예약됨",
  UNAVAILABLE: "사용 불가 기간",
  NOT_OPERATING_DAY: "운영하지 않는 요일",
  PAST: "이미 지난 시각",
};

export interface RecurringResult {
  created: { id: number; startAt: string; endAt: string }[];
  skipped: { date: string; reason: RecurringSkipReason }[];
}

// 사용 불가 기간 (관리자)
export interface FacilityUnavailable {
  id: number;
  facilityId: number;
  startAt: string;
  endAt: string;
  reason: string | null;
}

// 사용 불가 기간과 겹치는 기존 예약 (등록·수정 응답의 경고 목록)
export interface UnavailableConflict {
  id: number;
  startAt: string;
  endAt: string;
  title: string | null;
  user: { id: number; name: string };
}

export interface UnavailableSaveResult {
  unavailable: FacilityUnavailable;
  conflicts: UnavailableConflict[];
}
