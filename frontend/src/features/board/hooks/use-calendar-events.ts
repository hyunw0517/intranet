"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchBoardEvents, type CalendarRange } from "@/services/api/calendar";
import { postKeys } from "./use-posts";

// 캘린더 일정 queryKey
// 게시글 목록 키(postKeys.lists) 아래에 두어, 글을 쓰거나 고치면(cache.invalidateLists) 일정도 함께 다시 받는다.
export const calendarKeys = {
  board: (boardId: number, range: CalendarRange) => [...postKeys.lists(boardId), "events", range.start, range.end] as const,
};

// 캘린더 게시판 하나의 일정 - 달을 넘기는 동안 이전 달 일정을 유지해 화면이 비지 않게 한다.
export function useBoardEvents(boardId: number, range: CalendarRange) {
  return useQuery({
    queryKey: calendarKeys.board(boardId, range),
    queryFn: () => fetchBoardEvents(boardId, range),
    placeholderData: keepPreviousData,
  });
}
