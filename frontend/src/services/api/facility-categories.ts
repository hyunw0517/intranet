// 백엔드 reservations/facility-categories.controller 대응 (/reservations/categories)
import { apiFetch } from "@/services/api-client";
import type { FacilityCategory } from "@/types/reservation";

// 분류 입력 (운영 시간은 "HH:mm", 24시간 운영은 "00:00" ~ "24:00")
export interface FacilityCategoryInput {
  name: string;
  slotMinutes: number;
  openTime: string;
  closeTime: string;
  operatingDays: number[];
  maxAdvanceDays: number;
}

// 분류 목록 (정렬 순, 모든 회원)
export function fetchFacilityCategories() {
  return apiFetch<FacilityCategory[]>("/reservations/categories");
}

// 이하 관리자 - 규칙을 바꿔도 이미 있는 예약은 그대로, 새 예약부터 적용
export function createFacilityCategory(input: FacilityCategoryInput) {
  return apiFetch<FacilityCategory>("/reservations/categories", { method: "POST", body: input });
}

export function updateFacilityCategory(id: number, input: Partial<FacilityCategoryInput>) {
  return apiFetch<FacilityCategory>(`/reservations/categories/${id}`, { method: "PATCH", body: input });
}

// 시설이 남아 있으면 409
export function deleteFacilityCategory(id: number) {
  return apiFetch<boolean>(`/reservations/categories/${id}`, { method: "DELETE" });
}

// 화면의 최종 순서대로 id 전체 (그 사이 목록이 바뀌었으면 400)
export function reorderFacilityCategories(ids: number[]) {
  return apiFetch<boolean>("/reservations/categories/order", { method: "PATCH", body: { ids } });
}
