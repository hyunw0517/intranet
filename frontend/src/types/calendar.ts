// GET /boards/:boardId/events, GET /boards/events 응답 (백엔드 PostsService.findCalendarEvents)
// 비밀 일정은 작성자 본인에게만 내려온다. (관리자도 제외 - 서버가 걸러서 보냄)

// 일정 색 (백엔드 enum CalendarEventColor, null = 기본색). 실제 색은 features/board/calendar-colors.ts
export type CalendarEventColor = "RED" | "ORANGE" | "YELLOW" | "BLUE" | "PURPLE" | "GRAY";

export interface CalendarEvent {
  id: number; // 게시글 id (상세: /boards/:boardId/posts/:id)
  boardId: number;
  title: string;
  eventStartAt: string; // UTC ISO
  eventEndAt: string; // UTC ISO (종일 일정은 KST 그날 23:59:59)
  isAllDay: boolean | null;
  eventColor: CalendarEventColor | null;
  isSecret: boolean; // true면 내 비밀 일정
  author: { id: number; name: string; nickname: string | null } | null; // 익명 게시판의 다른 사람 일정은 null
}

export interface CalendarEventsResult {
  boards: { id: number; name: string; showLeaves: boolean }[];
  // 휴가자 표시: 보고 있는 게시판 중 하나라도 켜져 있으면 true → 휴가 애드온이 켜져 있으면 휴가 API를 한 번만 불러 "휴가 N명"
  showLeaves: boolean;
  events: CalendarEvent[]; // 시작 시각 순
}
