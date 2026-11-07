"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Lock } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";
import type { PostBoardInfo } from "@/types/post";
import { addMonths, eventsByDate, eventsInMonth, formatMonthParam, gridRange, monthGrid, parseMonth, type YearMonth } from "../calendar-month";
import { formatEventRange } from "../event-date";
import { useBoardEvents } from "../hooks/use-calendar-events";
import { CalendarMonthGrid } from "./calendar-month-grid";

type CalendarViewMode = "month" | "list";

// 캘린더 게시판 화면: 기본은 월간 달력, [목록]을 누르면 그달 일정 목록
// - 보고 있는 달·보기 방식은 URL(?month=2026-11&view=list)에 둔다. (상세에서 뒤로 가거나 새로고침해도 유지)
// - 일정은 달력에 보이는 칸 범위(앞뒤 주 포함)로 한 번에 받는다. 목록은 그중 이번 달과 겹치는 일정만.
// - 비밀 일정은 서버가 작성자 본인에게만 내려준다.
export function CalendarBoard({ boardId, board }: { boardId: number; board: PostBoardInfo }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ym = parseMonth(searchParams.get("month"));
  const view: CalendarViewMode = searchParams.get("view") === "list" ? "list" : "month";

  const weeks = monthGrid(ym);
  const range = gridRange(weeks);
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useBoardEvents(boardId, range);

  const go = (next: { ym?: YearMonth; view?: CalendarViewMode }) => {
    const params = new URLSearchParams();
    params.set("month", formatMonthParam(next.ym ?? ym));
    if ((next.view ?? view) === "list") params.set("view", "list");
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="이전 달" onClick={() => go({ ym: addMonths(ym, -1) })}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-28 text-center text-lg font-semibold tabular-nums" aria-live="polite">
            {ym.year}년 {ym.month}월
          </h2>
          <Button variant="outline" size="icon-sm" aria-label="다음 달" onClick={() => go({ ym: addMonths(ym, 1) })}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => go({ ym: parseMonth(null) })}>
            오늘
          </Button>
        </div>

        {/* 보기 전환 (달력 / 목록) */}
        <div role="group" aria-label="보기 방식" className="flex rounded-lg border p-0.5">
          {(
            [
              { mode: "month", label: "달력", icon: CalendarDays },
              { mode: "list", label: "목록", icon: List },
            ] as const
          ).map(({ mode, label, icon: Icon }) => (
            <Button
              key={mode}
              variant="ghost"
              size="sm"
              aria-pressed={view === mode}
              onClick={() => go({ view: mode })}
              className={cn("h-7 px-2.5", view === mode && "bg-accent text-foreground")}
            >
              <Icon aria-hidden />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        // 달을 넘기는 동안에는 이전 달 일정을 흐리게 보여 준다. (keepPreviousData)
        <div className={cn(isPlaceholderData && "opacity-60 transition-opacity")}>
          {view === "month" ? (
            <CalendarMonthGrid boardId={boardId} weeks={weeks} eventsByDate={eventsByDate(data.events)} />
          ) : (
            <CalendarEventList boardId={boardId} board={board} events={eventsInMonth(data.events, ym)} />
          )}
        </div>
      )}
    </div>
  );
}

// 목록 보기: 이번 달과 겹치는 일정 (시작 시각 순)
function CalendarEventList({
  boardId,
  board,
  events,
}: {
  boardId: number;
  board: PostBoardInfo;
  events: CalendarEvent[];
}) {
  if (events.length === 0) return <EmptyState message="이번 달 일정이 없습니다." />;

  return (
    <ul className="divide-y rounded-lg border">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/boards/${boardId}/posts/${event.id}`}
            className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums sm:w-72">
              {formatEventRange(event.eventStartAt, event.eventEndAt, event.isAllDay)}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {event.isSecret && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="비밀 일정" />}
              <span className="truncate font-medium">{event.title}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {event.author ? event.author.name : board.isAnonymous ? "익명" : "-"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
