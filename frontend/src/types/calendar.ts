// GET /boards/:boardId/events, GET /boards/events 응답 (백엔드 PostsService.findCalendarEvents)
// 비밀 일정은 작성자 본인에게만 내려온다. (관리자도 제외 - 서버가 걸러서 보냄)

export interface CalendarEvent {
  id: number; // 게시글 id (상세: /boards/:boardId/posts/:id)
  boardId: number;
  title: string;
  eventStartAt: string; // UTC ISO
  eventEndAt: string; // UTC ISO (종일 일정은 KST 그날 23:59:59)
  isAllDay: boolean | null;
  isSecret: boolean; // true면 내 비밀 일정
  author: { id: number; name: string; nickname: string | null } | null; // 익명 게시판의 다른 사람 일정은 null
}

export interface CalendarEventsResult {
  boards: { id: number; name: string }[];
  events: CalendarEvent[]; // 시작 시각 순
}
