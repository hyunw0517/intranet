"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBoardNavigation } from "@/services/api/board-auths";
import { useAuth } from "@/providers/auth-provider";

// 직원용 게시판 queryKey (이후 게시글 목록·상세 키도 여기에 추가)
export const boardKeys = {
  all: ["boards"] as const,
  navigation: () => [...boardKeys.all, "navigation"] as const,
};

// 사이드바 게시판 메뉴와 게시판 화면(이름·설명)이 같은 캐시를 쓴다.
// 승인 전(GUEST)은 서버가 403을 주므로 요청하지 않는다.
export function useBoardNavigation() {
  const { user } = useAuth();

  return useQuery({
    queryKey: boardKeys.navigation(),
    queryFn: fetchBoardNavigation,
    enabled: !!user && user.role !== "GUEST",
  });
}
