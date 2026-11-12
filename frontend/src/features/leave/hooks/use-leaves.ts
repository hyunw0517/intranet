"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CalendarRange } from "@/services/api/calendar";
import { fetchLeaveByDocument, fetchLeaveCalendar, fetchMyLeaves, fetchMyLeaveSummary } from "@/services/api/leaves";

// 휴가 queryKey - 휴가 신청·결재 결과는 결재 화면에서 바뀌므로 결재 키와 나눠 두고,
// 휴가내역 화면은 열 때마다 다시 조회한다(staleTime 기본 0).
export const leaveKeys = {
  all: ["leaves"] as const,
  summary: (year: number) => [...leaveKeys.all, "me", year] as const,
  mine: (year: number) => [...leaveKeys.all, "mine", year] as const,
  byDocument: (documentId: number) => [...leaveKeys.all, "document", documentId] as const,
  calendar: (range: CalendarRange) => [...leaveKeys.all, "calendar", range.start, range.end] as const,
};

// 내 연차 현황
export function useMyLeaveSummary(year: number, enabled = true) {
  return useQuery({ queryKey: leaveKeys.summary(year), queryFn: () => fetchMyLeaveSummary(year), enabled });
}

// 내 휴가 신청 목록
export function useMyLeaves(year: number) {
  return useQuery({ queryKey: leaveKeys.mine(year), queryFn: () => fetchMyLeaves(year), placeholderData: keepPreviousData });
}

// 결재 문서에 딸린 휴가 정보 (휴가 문서일 때만 부른다)
export function useLeaveByDocument(documentId: number, enabled: boolean) {
  return useQuery({ queryKey: leaveKeys.byDocument(documentId), queryFn: () => fetchLeaveByDocument(documentId), enabled });
}

// 캘린더 휴가자 (게시판 옵션 "휴가자 표시"가 켜지고 휴가 애드온이 켜져 있을 때만)
export function useLeaveCalendar(range: CalendarRange, enabled: boolean) {
  return useQuery({
    queryKey: leaveKeys.calendar(range),
    queryFn: () => fetchLeaveCalendar(range),
    enabled,
    placeholderData: keepPreviousData,
  });
}
