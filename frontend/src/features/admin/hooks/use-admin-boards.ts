"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchBoardAuths } from "@/services/api/board-auths";
import { fetchAdminBoards } from "@/services/api/boards";
import { boardKeys } from "@/features/board/hooks/use-board-navigation";

// 관리자 게시판·게시판 권한 queryKey
// 권한 규칙 수(authCount)가 게시판 목록에 표시되므로 규칙을 바꾸면 접두사(all)로 둘 다 갱신한다.
export const adminBoardKeys = {
  all: ["admin", "boards"] as const,
  list: () => [...adminBoardKeys.all, "list"] as const,
  auths: (boardId: number) => [...adminBoardKeys.all, "auths", boardId] as const,
};

export function useAdminBoards() {
  return useQuery({ queryKey: adminBoardKeys.list(), queryFn: fetchAdminBoards });
}

export function useBoardAuths(boardId: number, enabled = true) {
  return useQuery({
    queryKey: adminBoardKeys.auths(boardId),
    queryFn: () => fetchBoardAuths(boardId),
    enabled,
  });
}

// 게시판·권한 규칙을 바꾸는 요청 공용
export function useAdminBoardMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // 관리자 본인의 직원용 게시판 메뉴도 갱신한다. (다른 회원은 각자 브라우저에서 30초 뒤 다시 조회)
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminBoardKeys.all }),
        queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      ]),
  });
}
