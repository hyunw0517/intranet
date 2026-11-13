"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminFacilities } from "@/services/api/facilities";
import { fetchFacilityCategories } from "@/services/api/facility-categories";
import { fetchFacilityUnavailable } from "@/services/api/facility-unavailable";
import { fetchAdminReservations } from "@/services/api/reservations";
import { reservationKeys } from "@/features/reservation/hooks/use-reservations";

type AdminReservationQuery = Parameters<typeof fetchAdminReservations>[0];

// 관리자 시설·예약 queryKey
// 분류·시설·사용 불가 기간을 바꾸면 직원용 시간표(reservationKeys)도 함께 다시 조회한다. (관리자 본인 화면 기준)
export const adminFacilityKeys = {
  all: ["admin", "facilities"] as const,
  categories: () => [...adminFacilityKeys.all, "categories"] as const,
  facilities: (categoryId?: number) => [...adminFacilityKeys.all, "list", categoryId ?? "all"] as const,
  unavailable: (facilityId: number, page: number) => [...adminFacilityKeys.all, "unavailable", facilityId, page] as const,
  reservations: (query: AdminReservationQuery) => [...adminFacilityKeys.all, "reservations", query] as const,
};

export function useAdminFacilityCategories() {
  return useQuery({ queryKey: adminFacilityKeys.categories(), queryFn: fetchFacilityCategories });
}

// 사용 안 함 포함
export function useAdminFacilities(categoryId?: number) {
  return useQuery({
    queryKey: adminFacilityKeys.facilities(categoryId),
    queryFn: () => fetchAdminFacilities(categoryId),
    enabled: categoryId !== undefined,
  });
}

// 전체 시설 (예약 관리 필터용)
export function useAllAdminFacilities() {
  return useQuery({ queryKey: adminFacilityKeys.facilities(), queryFn: () => fetchAdminFacilities() });
}

export function useFacilityUnavailableList(facilityId: number | null, page: number) {
  return useQuery({
    queryKey: adminFacilityKeys.unavailable(facilityId ?? 0, page),
    queryFn: () => fetchFacilityUnavailable(facilityId!, page),
    enabled: facilityId !== null,
    placeholderData: keepPreviousData,
  });
}

export function useAdminReservations(query: AdminReservationQuery) {
  return useQuery({
    queryKey: adminFacilityKeys.reservations(query),
    queryFn: () => fetchAdminReservations(query),
    placeholderData: keepPreviousData,
  });
}

// 시설·분류·사용 불가 기간·예약을 바꾸는 요청 공용
export function useAdminFacilityMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminFacilityKeys.all }),
        queryClient.invalidateQueries({ queryKey: reservationKeys.all }),
      ]),
  });
}
