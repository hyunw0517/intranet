"use client";

import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { fetchHolidays, type Holiday } from "@/services/api/holidays";

export const holidayKeys = {
  year: (year: number) => ["holidays", year] as const,
};

const toHolidayMap = (results: UseQueryResult<Holiday[]>[]) =>
  new Map(results.flatMap((result) => result.data ?? []).map((holiday) => [holiday.date, holiday.name]));

// 달력에 보이는 날짜의 공휴일 (날짜 → 이름). 대시보드 달력과 게시판 캘린더가 함께 쓴다.
// 12월·1월 달력은 앞뒤 해의 날짜도 보이므로 첫 칸과 마지막 칸의 연도를 모두 조회한다.
// 조회에 실패하면 빈 Map이라 공휴일 색만 빠지고 달력은 그대로 동작한다.
export function useHolidayMap(weeks: { date: string }[][]) {
  const firstYear = Number(weeks[0][0].date.slice(0, 4));
  const lastYear = Number(weeks[weeks.length - 1][6].date.slice(0, 4));
  const years = firstYear === lastYear ? [firstYear] : [firstYear, lastYear];

  return useQueries({
    queries: years.map((year) => ({
      queryKey: holidayKeys.year(year),
      queryFn: () => fetchHolidays(year),
      staleTime: 60 * 60 * 1000,
      retry: false,
    })),
    combine: toHolidayMap,
  });
}
