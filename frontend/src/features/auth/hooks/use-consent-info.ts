"use client";

import { useQuery } from "@tanstack/react-query";
import { getConsentInfo } from "@/services/api/auth";

export const consentKeys = {
  info: ["consent", "info"] as const,
};

// 회사명은 배포 설정이라 화면을 보는 동안 바뀌지 않는다.
export function useConsentInfo() {
  return useQuery({
    queryKey: consentKeys.info,
    queryFn: getConsentInfo,
    staleTime: Infinity,
  });
}
