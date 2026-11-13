"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFacilities } from "@/services/api/facilities";
import { fetchFacilityCategories } from "@/services/api/facility-categories";
import {
  fetchMyReservations,
  fetchReservation,
  fetchSchedule,
  type ReservationListQuery,
  type ScheduleQuery,
} from "@/services/api/reservations";

// 시설 예약 queryKey - 예약을 만들거나 바꾸면 all 접두사로 시간표·내 예약·상세를 함께 다시 조회한다.
// (관리자 화면도 분류·시설을 바꾸면 이 접두사를 무효화한다)
export const reservationKeys = {
  all: ["reservations"] as const,
  categories: () => [...reservationKeys.all, "categories"] as const,
  facilities: (categoryId?: number) => [...reservationKeys.all, "facilities", categoryId ?? "all"] as const,
  schedule: (query: ScheduleQuery) =>
    [...reservationKeys.all, "schedule", query.categoryId ?? null, query.facilityId ?? null, query.from, query.to] as const,
  mine: (query: ReservationListQuery) => [...reservationKeys.all, "mine", query] as const,
  detail: (id: number) => [...reservationKeys.all, "detail", id] as const,
};

// 분류 목록 (규칙 포함) - 자주 바뀌지 않는다.
export function useFacilityCategories() {
  return useQuery({ queryKey: reservationKeys.categories(), queryFn: fetchFacilityCategories, staleTime: 60_000 });
}

// 예약 가능한 시설 (분류별)
export function useFacilities(categoryId: number | undefined) {
  return useQuery({
    queryKey: reservationKeys.facilities(categoryId),
    queryFn: () => fetchFacilities(categoryId),
    enabled: categoryId !== undefined,
    staleTime: 60_000,
  });
}

// 시간표 - 날짜를 넘기는 동안 이전 화면을 유지한다. (keepPreviousData)
export function useSchedule(query: ScheduleQuery | null) {
  return useQuery({
    queryKey: query ? reservationKeys.schedule(query) : [...reservationKeys.all, "schedule", "none"],
    queryFn: () => fetchSchedule(query!),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });
}

export function useMyReservations(query: ReservationListQuery) {
  return useQuery({
    queryKey: reservationKeys.mine(query),
    queryFn: () => fetchMyReservations(query),
    placeholderData: keepPreviousData,
  });
}

export function useReservation(id: number | null) {
  return useQuery({
    queryKey: reservationKeys.detail(id ?? 0),
    queryFn: () => fetchReservation(id!),
    enabled: id !== null,
  });
}

// 예약을 바꾸는 요청 공용 (예약·반복·수정·취소·삭제) - 성공하면 시간표·내 예약·상세를 다시 조회
export function useReservationMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reservationKeys.all }),
  });
}
