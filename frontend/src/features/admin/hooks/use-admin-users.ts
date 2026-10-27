"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUser, fetchUsers, type UserListQuery } from "@/services/api/users";

// 관리자 회원 queryKey (목록·상세를 같은 접두사로 묶어 한 번에 무효화)
export const adminUserKeys = {
  all: ["admin", "users"] as const,
  list: (query: UserListQuery) => [...adminUserKeys.all, "list", query] as const,
  detail: (id: number) => [...adminUserKeys.all, "detail", id] as const,
};

// 회원 목록 - 페이지·필터를 바꾸는 동안 이전 목록을 유지해 표가 깜빡이지 않게 한다.
export function useAdminUsers(query: UserListQuery) {
  return useQuery({
    queryKey: adminUserKeys.list(query),
    queryFn: () => fetchUsers(query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: number) {
  return useQuery({
    queryKey: adminUserKeys.detail(id),
    queryFn: () => fetchUser(id),
  });
}

// 회원 정보를 바꾸는 요청 공용 (권한·상태·정보 수정, 직급·소속, 삭제·복구)
// 성공하면 회원 목록과 상세 캐시를 모두 갱신한다. 화면별 후처리(토스트 등)는 mutate의 옵션으로 넘긴다.
export function useAdminUserMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminUserKeys.all }),
  });
}
