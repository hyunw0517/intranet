"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchEnabledAddons } from "@/services/api/addons";

// 켜진 애드온 queryKey
export const addonKeys = {
  enabled: ["addons", "enabled"] as const,
};

// 켜진 애드온 목록 (메뉴 표시·페이지 접근에 사용)
// - 서버 배포 설정(backend/.env ADDONS)이라 실행 중에는 바뀌지 않으므로 오래 캐시한다.
// - 승인 전(GUEST)은 API가 403이므로 호출하지 않는다(enabled: false). GUEST 화면은 PendingApprovalGate가 막는다.
export function useEnabledAddons(enabled = true) {
  return useQuery({
    queryKey: addonKeys.enabled,
    queryFn: fetchEnabledAddons,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
