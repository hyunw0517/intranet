// 백엔드 common/holidays.controller 대응 (/common/holidays)
import { apiFetch } from "@/services/api-client";

export interface Holiday {
  date: string; // yyyy-MM-dd
  name: string;
}

// 그해 공휴일 (외부 API 장애이거나 조회 범위 밖의 연도이면 빈 목록)
export function fetchHolidays(year: number) {
  return apiFetch<Holiday[]>("/common/holidays", { query: { year } });
}
