"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchEnabledAddons } from "@/services/api/addons";

// 켜진 애드온 queryKey
export const addonKeys = {
  enabled: ["addons", "enabled"] as const,
};

// 켜진 애드온 목록 (배포 설정이라 실행 중에 바뀌지 않아서 오래 캐시한다)
// GUEST는 API가 403이라 호출하지 않는다.
export function useEnabledAddons(enabled = true) {
  return useQuery({
    queryKey: addonKeys.enabled,
    queryFn: fetchEnabledAddons,
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
