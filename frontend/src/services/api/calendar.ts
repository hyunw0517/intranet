// 백엔드 calendar.controller 대응 (/boards/events, /boards/:boardId/events)
import { apiFetch } from "@/services/api-client";
import type { CalendarEventsResult } from "@/types/calendar";

// 조회 기간: start 이상 ~ end 미만, 시간대가 있는 ISO 문자열 (예: 2026-11-01T00:00:00+09:00)
// URLSearchParams가 "+"를 %2B로 인코딩한다. (직접 붙이면 서버에서 공백으로 바뀌어 400)
export interface CalendarRange {
  start: string;
  end: string;
}

// 캘린더 게시판 하나의 일정 (읽기 권한이 없으면 404, 캘린더 게시판이 아니면 400)
export function fetchBoardEvents(boardId: number, range: CalendarRange) {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  return apiFetch<CalendarEventsResult>(`/boards/${boardId}/events?${params}`);
}

// 통합 캘린더: 볼 수 있는 캘린더 게시판들의 일정 (boardIds를 주면 그중 볼 수 있는 것만)
export function fetchEvents(range: CalendarRange, boardIds?: number[]) {
  const params = new URLSearchParams({ start: range.start, end: range.end });
  if (boardIds?.length) params.set("boardIds", boardIds.join(","));
  return apiFetch<CalendarEventsResult>(`/boards/events?${params}`);
}
