// 백엔드 reservations/facility-unavailable.controller 대응 (/reservations/facilities/:facilityId/unavailable, 관리자)
import { apiFetch } from "@/services/api-client";
import type { FacilityUnavailable, UnavailableSaveResult } from "@/types/reservation";
import type { PageResult } from "@/types/pagination";

// 시각은 시간대가 있는 ISO 문자열 ("2026-11-12T10:00:00+09:00")
export interface UnavailableInput {
  startAt: string;
  endAt: string;
  reason?: string | null;
}

export function fetchFacilityUnavailable(facilityId: number, page = 1) {
  return apiFetch<PageResult<FacilityUnavailable>>(`/reservations/facilities/${facilityId}/unavailable`, {
    query: { page, take: 20 },
  });
}

// 겹치는 기존 예약이 있어도 저장되고, conflicts로 경고 목록이 온다. (기존 예약은 그대로)
export function createFacilityUnavailable(facilityId: number, input: UnavailableInput) {
  return apiFetch<UnavailableSaveResult>(`/reservations/facilities/${facilityId}/unavailable`, {
    method: "POST",
    body: input,
  });
}

export function updateFacilityUnavailable(facilityId: number, id: number, input: Partial<UnavailableInput>) {
  return apiFetch<UnavailableSaveResult>(`/reservations/facilities/${facilityId}/unavailable/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteFacilityUnavailable(facilityId: number, id: number) {
  return apiFetch<boolean>(`/reservations/facilities/${facilityId}/unavailable/${id}`, { method: "DELETE" });
}
