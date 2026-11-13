// 백엔드 reservations/reservations.controller 대응 (/reservations)
import { apiFetch } from "@/services/api-client";
import type { PageResult } from "@/types/pagination";
import type { RecurringResult, Reservation, ReservationStatus, ScheduleResult } from "@/types/reservation";

// 시간표 조회: 시설 하나 또는 분류 하나, [from, to) 최대 31일, 시간대가 있는 ISO 문자열
// (apiFetch의 query는 URLSearchParams로 "+"를 %2B로 인코딩한다)
export interface ScheduleQuery {
  facilityId?: number;
  categoryId?: number;
  from: string;
  to: string;
}

export function fetchSchedule(query: ScheduleQuery) {
  return apiFetch<ScheduleResult>("/reservations/schedule", { query: { ...query } });
}

export interface ReservationListQuery {
  page?: number;
  take?: number;
  order?: "asc" | "desc";
  status?: ReservationStatus;
  from?: string;
  to?: string;
}

// 내 예약 (취소 포함, 삭제 제외)
export function fetchMyReservations(query: ReservationListQuery) {
  return apiFetch<PageResult<Reservation>>("/reservations/me", { query: { ...query } });
}

// 전체 예약 (관리자)
export function fetchAdminReservations(query: ReservationListQuery & { facilityId?: number; userId?: number }) {
  return apiFetch<PageResult<Reservation>>("/reservations/admin", { query: { ...query } });
}

// 예약 상세 (모든 회원 - 시간표의 예약을 눌렀을 때)
export function fetchReservation(id: number) {
  return apiFetch<Reservation>(`/reservations/${id}`);
}

export interface ReservationInput {
  facilityId: number;
  startAt: string;
  endAt: string;
  title?: string | null;
  description?: string | null;
}

// 규칙 위반 400, 겹침·사용 불가 기간 409
export function createReservation(input: ReservationInput) {
  return apiFetch<Reservation>("/reservations", { method: "POST", body: input });
}

export interface RecurringReservationInput {
  facilityId: number;
  startDate: string; // "YYYY-MM-DD" (KST)
  endDate: string;
  weekdays: number[]; // ISO 1 = 월 … 7 = 일
  startTime: string; // "HH:mm"
  endTime: string;
  title?: string | null;
  description?: string | null;
}

// 이미 예약된 날·사용 불가 기간·운영하지 않는 요일·지난 시각은 건너뛰고 skipped로 알려 준다.
export function createRecurringReservation(input: RecurringReservationInput) {
  return apiFetch<RecurringResult>("/reservations/recurring", { method: "POST", body: input });
}

// 시간·제목·설명만 (시설은 바꿀 수 없음). 본인·관리자, 시작 전만
export function updateReservation(id: number, input: Partial<Omit<ReservationInput, "facilityId">>) {
  return apiFetch<Reservation>(`/reservations/${id}`, { method: "PATCH", body: input });
}

export function cancelReservation(id: number) {
  return apiFetch<boolean>(`/reservations/${id}/cancel`, { method: "PATCH" });
}

// 하나라도 취소할 수 없으면 전체 실패
export function cancelReservations(ids: number[]) {
  return apiFetch<boolean>("/reservations/bulk/cancel", { method: "PATCH", body: { ids } });
}

// 본인은 시작 전만, 관리자는 언제나 (soft delete)
export function deleteReservation(id: number) {
  return apiFetch<boolean>(`/reservations/${id}`, { method: "DELETE" });
}
