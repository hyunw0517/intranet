"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchBoardEvents, type CalendarRange } from "@/services/api/calendar";
import { postKeys } from "./use-posts";

// 캘린더 일정 queryKey (postKeys.events 아래)
// 글을 쓰거나 고치면 cache.invalidateLists가 이 키도 함께 무효화한다.
// 주의: postKeys.lists 아래에 두면 상세 조회 시 목록 캐시를 고치는 코드(syncListAfterView)가
//       일정 응답을 목록 모양으로 다뤄 TypeError가 난다. (11/05 버그)
export const calendarKeys = {
  board: (boardId: number, range: CalendarRange) => [...postKeys.events(boardId), range.start, range.end] as const,
};

// 캘린더 게시판 하나의 일정 - 달을 넘기는 동안 이전 달 일정을 유지해 화면이 비지 않게 한다.
export function useBoardEvents(boardId: number, range: CalendarRange) {
  return useQuery({
    queryKey: calendarKeys.board(boardId, range),
    queryFn: () => fetchBoardEvents(boardId, range),
    placeholderData: keepPreviousData,
  });
}
