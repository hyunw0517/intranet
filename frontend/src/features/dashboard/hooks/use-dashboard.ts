"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fetchAuditLogs, type AuditLogQuery } from "@/services/api/audit-logs";
import { fetchEvents, fetchRecentNotices, type CalendarRange } from "@/services/api/calendar";
import { fetchAdminReservations, fetchMyReservations } from "@/services/api/reservations";
import { fetchUserStats } from "@/services/api/users";

// 대시보드 카드는 카드마다 따로 조회한다. 카드 하나가 실패해도 나머지는 그대로 보인다.
export const dashboardKeys = {
  all: ["dashboard"] as const,
  notices: () => [...dashboardKeys.all, "notices"] as const,
  events: (range: CalendarRange) => [...dashboardKeys.all, "events", range] as const,
  myReservations: (range: CalendarRange) => [...dashboardKeys.all, "my-reservations", range] as const,
  adminReservations: (range: CalendarRange) => [...dashboardKeys.all, "admin-reservations", range] as const,
  userStats: () => [...dashboardKeys.all, "user-stats"] as const,
  auditLogs: (query: AuditLogQuery) => [...dashboardKeys.all, "audit-logs", query] as const,
};

// 그날(KST) 00:00 ~ 다음 날 00:00
export function dayRange(date: string): CalendarRange {
  const start = `${date}T00:00:00+09:00`;
  return { start, end: new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString() };
}

export function todayRange(): CalendarRange & { date: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return { date, ...dayRange(date) };
}

export function useRecentNotices() {
  return useQuery({ queryKey: dashboardKeys.notices(), queryFn: fetchRecentNotices });
}

export function useDayEvents(range: CalendarRange) {
  return useQuery({ queryKey: dashboardKeys.events(range), queryFn: () => fetchEvents(range) });
}

// 그날 시작하는 내 예약 (취소 제외, 시작 시각 순)
export function useDayMyReservations(range: CalendarRange, enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.myReservations(range),
    queryFn: () => fetchMyReservations({ from: range.start, to: range.end, status: "RESERVED", order: "asc", take: 20 }),
    enabled,
  });
}

// 오늘 시작하는 전체 예약 (관리자)
export function useTodayAdminReservations(range: CalendarRange) {
  return useQuery({
    queryKey: dashboardKeys.adminReservations(range),
    queryFn: () => fetchAdminReservations({ from: range.start, to: range.end, status: "RESERVED", order: "asc", take: 6 }),
  });
}

export function useUserStats() {
  return useQuery({ queryKey: dashboardKeys.userStats(), queryFn: fetchUserStats });
}

// 감사 로그 목록 ("더 보기"로 이어서 조회)
export function useAuditLogs(query: AuditLogQuery) {
  return useInfiniteQuery({
    queryKey: dashboardKeys.auditLogs(query),
    queryFn: ({ pageParam }) => fetchAuditLogs({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}
