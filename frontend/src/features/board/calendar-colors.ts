// 캘린더 일정 색 (2026-11-12 사용자 결정: 정해진 색 중 일정마다 작성자가 선택, null = 기본색)
// 서버는 색 이름(enum)만 저장하고, 실제 색은 여기서 라이트/다크 모두 글자가 잘 보이게 정한다.
// 초록은 "휴가 N명" 항목 색이라 선택지에 없다 (leave-day-chip.tsx).
import type { CalendarEventColor } from "@/types/calendar";

export interface EventColorOption {
  value: CalendarEventColor | null; // null = 기본(포인트색)
  label: string;
  box: string; // 달력 일정 박스 (배경·테두리·글자·hover)
  swatch: string; // 색 고르기 동그라미·목록 점
}

export const EVENT_COLOR_OPTIONS: EventColorOption[] = [
  { value: null, label: "기본", box: "border-primary/20 bg-primary/10 hover:bg-primary/20", swatch: "bg-primary" },
  {
    value: "RED",
    label: "빨강",
    box: "border-red-600/25 bg-red-600/10 text-red-900 hover:bg-red-600/20 dark:border-red-400/30 dark:bg-red-400/15 dark:text-red-200 dark:hover:bg-red-400/25",
    swatch: "bg-red-500",
  },
  {
    value: "ORANGE",
    label: "주황",
    box: "border-orange-600/25 bg-orange-500/10 text-orange-900 hover:bg-orange-500/20 dark:border-orange-400/30 dark:bg-orange-400/15 dark:text-orange-200 dark:hover:bg-orange-400/25",
    swatch: "bg-orange-500",
  },
  {
    value: "YELLOW",
    label: "노랑",
    box: "border-yellow-600/30 bg-yellow-400/20 text-yellow-900 hover:bg-yellow-400/30 dark:border-yellow-300/30 dark:bg-yellow-300/15 dark:text-yellow-100 dark:hover:bg-yellow-300/25",
    swatch: "bg-yellow-400",
  },
  {
    value: "BLUE",
    label: "파랑",
    box: "border-sky-600/25 bg-sky-500/10 text-sky-900 hover:bg-sky-500/20 dark:border-sky-400/30 dark:bg-sky-400/15 dark:text-sky-200 dark:hover:bg-sky-400/25",
    swatch: "bg-sky-500",
  },
  {
    value: "PURPLE",
    label: "보라",
    box: "border-violet-600/25 bg-violet-500/10 text-violet-900 hover:bg-violet-500/20 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-200 dark:hover:bg-violet-400/25",
    swatch: "bg-violet-500",
  },
  {
    value: "GRAY",
    label: "회색",
    box: "border-zinc-500/25 bg-zinc-500/10 text-zinc-800 hover:bg-zinc-500/20 dark:border-zinc-400/30 dark:bg-zinc-400/15 dark:text-zinc-200 dark:hover:bg-zinc-400/25",
    swatch: "bg-zinc-500",
  },
];

export function eventColorOption(color: CalendarEventColor | null | undefined): EventColorOption {
  return EVENT_COLOR_OPTIONS.find((o) => o.value === (color ?? null)) ?? EVENT_COLOR_OPTIONS[0];
}
