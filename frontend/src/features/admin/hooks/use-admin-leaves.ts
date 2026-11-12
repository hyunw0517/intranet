"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLeaveGrants, type LeaveGrantListQuery } from "@/services/api/leave-grants";

// 관리자 연차 관리 queryKey - 재계산·조정 후 all 접두사로 목록을 다시 조회한다.
export const adminLeaveKeys = {
  all: ["admin", "leaves"] as const,
  grants: (query: LeaveGrantListQuery) => [...adminLeaveKeys.all, "grants", query] as const,
};

export function useLeaveGrants(query: LeaveGrantListQuery) {
  return useQuery({
    queryKey: adminLeaveKeys.grants(query),
    queryFn: () => fetchLeaveGrants(query),
    placeholderData: keepPreviousData,
  });
}

// 재계산·조정 공용 - 성공하면 연차 현황을 다시 조회
export function useAdminLeaveMutation<TVariables = void, TData = unknown>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminLeaveKeys.all }),
  });
}
