// 백엔드 reservations/facilities.controller 대응 (/reservations/facilities)
import { apiFetch } from "@/services/api-client";
import type { Facility } from "@/types/reservation";

export interface FacilityInput {
  categoryId: number;
  name: string;
  location?: string | null;
  capacity?: number | null;
  description?: string | null;
  isActive?: boolean;
}

// 예약 가능한 시설 (사용 중인 것만)
export function fetchFacilities(categoryId?: number) {
  return apiFetch<Facility[]>("/reservations/facilities", { query: { categoryId } });
}

// 관리자 목록 (사용 안 함 포함)
export function fetchAdminFacilities(categoryId?: number) {
  return apiFetch<Facility[]>("/reservations/facilities/admin", { query: { categoryId } });
}

export function createFacility(input: FacilityInput) {
  return apiFetch<Facility>("/reservations/facilities", { method: "POST", body: input });
}

// isActive: false면 새 예약만 막고 기존 예약은 유지
export function updateFacility(id: number, input: Partial<FacilityInput>) {
  return apiFetch<Facility>(`/reservations/facilities/${id}`, { method: "PATCH", body: input });
}

// 앞으로의 예약이 있으면 409
export function deleteFacility(id: number) {
  return apiFetch<boolean>(`/reservations/facilities/${id}`, { method: "DELETE" });
}
