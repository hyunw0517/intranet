"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDepartments } from "@/services/api/departments";
import { fetchJobTitles } from "@/services/api/job-titles";
import { fetchPositions } from "@/services/api/positions";
import { adminUserKeys } from "./use-admin-users";

// 조직(부서·직급·직책) queryKey
export const organizationKeys = {
  all: ["admin", "organization"] as const,
  departments: () => [...organizationKeys.all, "departments"] as const,
  positions: () => [...organizationKeys.all, "positions"] as const,
  jobTitles: () => [...organizationKeys.all, "job-titles"] as const,
};

export function useDepartments() {
  return useQuery({ queryKey: organizationKeys.departments(), queryFn: fetchDepartments });
}

// 직급·직책은 페이지 응답에서 목록만 꺼내 쓴다.
export function usePositions() {
  return useQuery({
    queryKey: organizationKeys.positions(),
    queryFn: fetchPositions,
    select: (result) => result.data,
  });
}

export function useJobTitles() {
  return useQuery({
    queryKey: organizationKeys.jobTitles(),
    queryFn: fetchJobTitles,
    select: (result) => result.data,
  });
}

// 부서·직급·직책을 바꾸는 요청 공용
// 회원 목록·상세에도 부서·직급 이름이 표시되므로 회원 캐시도 함께 갱신한다.
export function useOrganizationMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
      ]),
  });
}
