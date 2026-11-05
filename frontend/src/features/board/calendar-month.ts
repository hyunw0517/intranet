import { toKstParts } from "@/lib/format";
import type { CalendarRange } from "@/services/api/calendar";
import type { CalendarEvent } from "@/types/calendar";

// 월간 달력 계산 (KST 기준, 브라우저 시간대와 무관)
// 날짜는 "yyyy-MM-dd" 문자열로 다룬다. 달력의 날짜 계산은 시간대가 없는 순수 날짜라 Date.UTC로만 계산한다.
// 일정 시각(UTC ISO)은 toKstParts로 KST 날짜로 바꾼 뒤 날짜끼리 비교한다.

export interface YearMonth {
  year: number;
  month: number; // 1~12
}

export interface CalendarDay {
  date: string; // yyyy-MM-dd
  day: number; // 1~31
  weekday: number; // 0=일 ~ 6=토
  inMonth: boolean; // 이번 달이 아니면 false (앞뒤 주의 다른 달 날짜 → 흐리게)
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const ONE_DAY = 24 * 60 * 60 * 1000;

// 오늘 (KST)
export function todayKst(): string {
  return toKstParts(new Date().toISOString()).date;
}

// URL의 ?month=2026-11 → 연·월 (없거나 잘못되면 이번 달)
export function parseMonth(value: string | null): YearMonth {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year: Number(match[1]), month };
  }
  const [y, m] = todayKst().split("-").map(Number);
  return { year: y, month: m };
}

export const formatMonthParam = ({ year, month }: YearMonth) => `${year}-${pad(month)}`;

export function addMonths({ year, month }: YearMonth, diff: number): YearMonth {
  const d = new Date(Date.UTC(year, month - 1 + diff, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// 달력 칸: 1일이 있는 주의 일요일 ~ 말일이 있는 주의 토요일 (앞뒤 달은 그 주만)
// 예) 2026년 11월: 1일이 일요일이라 10월은 없고, 30일(월)이 있는 주의 12월 1~5일까지
export function monthGrid({ year, month }: YearMonth): CalendarDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const start = first.getTime() - first.getUTCDay() * ONE_DAY;
  const end = last.getTime() + (6 - last.getUTCDay()) * ONE_DAY;

  const weeks: CalendarDay[][] = [];
  for (let t = start; t <= end; t += ONE_DAY) {
    const d = new Date(t);
    if (d.getUTCDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      date: ymd(d),
      day: d.getUTCDate(),
      weekday: d.getUTCDay(),
      inMonth: d.getUTCMonth() === month - 1,
    });
  }
  return weeks;
}

// 달력에 보이는 칸 전체의 조회 기간 (KST 첫 칸 00:00 ~ 마지막 칸 다음 날 00:00)
export function gridRange(weeks: CalendarDay[][]): CalendarRange {
  const firstDate = weeks[0][0].date;
  const lastDate = weeks[weeks.length - 1][6].date;
  const next = new Date(Date.parse(`${lastDate}T00:00:00Z`) + ONE_DAY);
  return { start: `${firstDate}T00:00:00+09:00`, end: `${ymd(next)}T00:00:00+09:00` };
}

// 일정이 걸친 KST 날짜 범위 (시작일 ~ 종료일, 포함)
// 종료가 정확히 다음 날 00:00인 일정(예: 22:00~24:00)은 다음 날에 표시하지 않는다.
export function eventDateSpan(event: CalendarEvent): { from: string; to: string } {
  const s = toKstParts(event.eventStartAt);
  const e = toKstParts(event.eventEndAt);
  let to = e.date;
  if (!event.isAllDay && e.time === "00:00" && e.date > s.date) {
    to = ymd(new Date(Date.parse(`${e.date}T00:00:00Z`) - ONE_DAY));
  }
  return { from: s.date, to };
}

// 날짜별 일정 (여러 날 일정은 걸친 날마다 반복 - 사용자 결정)
export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const { from, to } = eventDateSpan(event);
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += ONE_DAY) {
      const key = ymd(new Date(t));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
  }
  return map;
}

// 이번 달과 겹치는 일정만 (목록 보기: 앞뒤 주의 다른 달 날짜에만 있는 일정은 제외)
export function eventsInMonth(events: CalendarEvent[], { year, month }: YearMonth): CalendarEvent[] {
  const first = `${year}-${pad(month)}-01`;
  const last = ymd(new Date(Date.UTC(year, month, 0)));
  return events.filter((event) => {
    const { from, to } = eventDateSpan(event);
    return from <= last && to >= first;
  });
}

// 달력 칸 안 표시: 종일이면 제목만, 시간 일정이면 "10:00 제목" (여러 날 일정의 이어지는 날은 제목만)
export function eventTimeLabel(event: CalendarEvent, date: string): string | null {
  if (event.isAllDay) return null;
  const s = toKstParts(event.eventStartAt);
  return s.date === date ? s.time : null;
}
