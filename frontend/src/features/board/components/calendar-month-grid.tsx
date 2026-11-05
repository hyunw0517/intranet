"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import { eventTimeLabel, todayKst, type CalendarDay } from "../calendar-month";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 요일 색: 일요일 빨강, 토요일 파랑, 나머지 기본 글자색 (사용자 결정)
function weekdayColor(weekday: number) {
  if (weekday === 0) return "text-red-600 dark:text-red-400";
  if (weekday === 6) return "text-blue-600 dark:text-blue-400";
  return "text-foreground";
}

// 칸에 바로 보여 주는 일정 수 (넘치면 "+N개" → 그날 일정 창)
const VISIBLE_DESKTOP = 3;
const VISIBLE_MOBILE = 2;

// 월간 달력 (일~토, 앞뒤 달은 그 주만 흐리게)
// 일정은 해당하는 날 칸에 박스로 넣는다. 여러 날 일정은 걸친 날마다 박스를 반복한다.
export function CalendarMonthGrid({
  boardId,
  weeks,
  eventsByDate,
}: {
  boardId: number;
  weeks: CalendarDay[][];
  eventsByDate: Map<string, CalendarEvent[]>;
}) {
  const today = todayKst();
  const [openDate, setOpenDate] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-lg border" role="grid" aria-label="월간 달력">
        <div className="grid grid-cols-7 border-b bg-muted/40" role="row">
          {WEEKDAYS.map((label, i) => (
            <div key={label} role="columnheader" className={cn("py-2 text-center text-xs font-medium", weekdayColor(i))}>
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b last:border-b-0" role="row">
            {week.map((day) => {
              const events = eventsByDate.get(day.date) ?? [];
              const hiddenDesktop = events.length - VISIBLE_DESKTOP;
              const hiddenMobile = events.length - VISIBLE_MOBILE;
              return (
                <div
                  key={day.date}
                  role="gridcell"
                  aria-label={`${day.date}${events.length ? `, 일정 ${events.length}개` : ""}`}
                  className={cn("min-h-24 min-w-0 border-r p-1 last:border-r-0 sm:min-h-28 sm:p-1.5", !day.inMonth && "bg-muted/20")}
                >
                  {/* 다른 달 날짜는 숫자·일정 모두 반투명 */}
                  <div className={cn("grid gap-1", !day.inMonth && "opacity-40")}>
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                        weekdayColor(day.weekday),
                        day.date === today && "bg-primary text-primary-foreground",
                      )}
                    >
                      {day.day}
                    </span>
                    {events.map((event, i) => (
                      <EventBox
                        key={event.id}
                        boardId={boardId}
                        event={event}
                        date={day.date}
                        // 모바일은 2개, 넓은 화면은 3개까지 (나머지는 +N개)
                        className={cn(i >= VISIBLE_MOBILE && "hidden sm:flex", i >= VISIBLE_DESKTOP && "sm:hidden")}
                      />
                    ))}
                    {hiddenMobile > 0 && (
                      <MoreButton count={hiddenMobile} className="sm:hidden" onClick={() => setOpenDate(day.date)} />
                    )}
                    {hiddenDesktop > 0 && (
                      <MoreButton count={hiddenDesktop} className="hidden sm:block" onClick={() => setOpenDate(day.date)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Dialog open={openDate !== null} onOpenChange={(open) => !open && setOpenDate(null)}>
        <DialogContent className="sm:max-w-md">
          {openDate && (
            <>
              <DialogHeader>
                <DialogTitle>{openDate} 일정</DialogTitle>
                <DialogDescription>일정을 누르면 게시글로 이동합니다.</DialogDescription>
              </DialogHeader>
              <div className="grid max-h-80 gap-1.5 overflow-y-auto">
                {(eventsByDate.get(openDate) ?? []).map((event) => (
                  <EventBox key={event.id} boardId={boardId} event={event} date={openDate} large />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// 일정 박스 (누르면 게시글 상세)
function EventBox({
  boardId,
  event,
  date,
  large,
  className,
}: {
  boardId: number;
  event: CalendarEvent;
  date: string;
  large?: boolean;
  className?: string;
}) {
  const time = eventTimeLabel(event, date);
  return (
    <Link
      href={`/boards/${boardId}/posts/${event.id}`}
      title={event.title}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1 py-0.5 text-[11px] leading-4 text-foreground hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-1.5 sm:text-xs",
        large && "px-2.5 py-1.5 text-sm sm:px-2.5 sm:text-sm",
        className,
      )}
    >
      {event.isSecret && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="비밀 일정" />}
      {time && <span className="hidden shrink-0 text-muted-foreground tabular-nums sm:inline">{time}</span>}
      {large && time && <span className="shrink-0 text-muted-foreground tabular-nums sm:hidden">{time}</span>}
      <span className="truncate">{event.title}</span>
    </Link>
  );
}

function MoreButton({ count, className, onClick }: { count: number; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-1 text-left text-[11px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:text-xs",
        className,
      )}
    >
      +{count}개
    </button>
  );
}
