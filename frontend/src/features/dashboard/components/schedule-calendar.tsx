"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMonths, dayColor, monthGrid, weekdayColor, type YearMonth } from "@/lib/calendar-month";
import { useHolidayMap } from "@/hooks/use-holidays";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 오늘 일정 카드의 월 달력: 일자만 표시하고, 날짜를 누르면 그날 일정으로 넘어간다.
export function ScheduleCalendar({
  selected,
  today,
  onSelect,
}: {
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  // 달력 탭을 열 때마다 선택한 날짜가 있는 달부터 보여 준다.
  const [month, setMonth] = useState<YearMonth>(() => {
    const [year, monthNumber] = selected.split("-").map(Number);
    return { year, month: monthNumber };
  });
  const title = `${month.year}년 ${month.month}월`;
  const weeks = monthGrid(month);
  const holidays = useHolidayMap(weeks);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="이전 달" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {title}
        </p>
        <Button variant="ghost" size="icon" aria-label="다음 달" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{title} 달력</caption>
        <thead>
          <tr>
            {WEEKDAYS.map((label, index) => (
              <th key={label} scope="col" className={cn("pb-1 text-xs font-medium", weekdayColor(index))}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((day) => {
                const [year, monthNumber] = day.date.split("-").map(Number);
                const holiday = holidays.get(day.date);
                return (
                  <td key={day.date} className="p-0.5 text-center">
                    <button
                      type="button"
                      title={holiday}
                      aria-label={`${year}년 ${monthNumber}월 ${day.day}일${holiday ? ` ${holiday}` : ""} 일정 보기`}
                      aria-pressed={day.date === selected}
                      onClick={() => onSelect(day.date)}
                      className={cn(
                        "mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                        dayColor(day.weekday, !!holiday),
                        !day.inMonth && "opacity-40",
                        day.date === selected && "ring-1 ring-primary",
                        day.date === today && "bg-primary text-primary-foreground hover:bg-primary/90",
                      )}
                    >
                      {day.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
