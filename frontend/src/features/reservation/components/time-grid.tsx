"use client";

import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReservationRules, ScheduleReservation, ScheduleUnavailable } from "@/types/reservation";
import { formatHm, isFutureSlot, kstToday, minutesFromDayStart } from "../reservation-time";

// 시간표 한 열 = (날짜, 시설) 한 쌍
// - 하루 보기: 같은 날짜 × 분류의 시설들
// - 주간 보기: 같은 시설 × 월~일
export interface TimeGridColumn {
  key: string;
  label: string;
  sublabel?: string;
  date: string;
  facilityId: number;
  closed?: boolean; // 운영하지 않는 요일 (칸을 누를 수 없음)
  highlight?: boolean; // 머리글 강조 (주간 보기의 오늘)
}

interface TimeGridProps {
  columns: TimeGridColumn[];
  rules: ReservationRules;
  reservations: ScheduleReservation[];
  unavailable: ScheduleUnavailable[];
  onSlotClick: (column: TimeGridColumn, minute: number) => void;
  onReservationClick: (reservation: ScheduleReservation) => void;
}

// 한 칸의 최소 높이(px) - 예약 단위가 짧아도 누를 수 있는 크기를 보장한다.
const MIN_SLOT_PX = 22;
const HOUR_PX = 48;

// 시간표 격자 (세로 = 운영 시간, 가로 = 열)
// - 빈 칸은 버튼이다: 누르면 그 시설·시각으로 예약 창이 열린다. (지난 칸·운영하지 않는 요일은 비활성)
// - 예약·사용 불가 기간은 시각에 맞춰 칸 위에 겹쳐 그린다. 사용 불가 기간이 여러 날이면 그날 운영 시간만큼 잘라 그린다.
// - 열이 많으면 가로 스크롤 (시간 축은 왼쪽에 고정)
export function TimeGrid({ columns, rules, reservations, unavailable, onSlotClick, onReservationClick }: TimeGridProps) {
  const { openMinute, closeMinute, slotMinutes } = rules;
  const pxPerMinute = Math.max(HOUR_PX / 60, MIN_SLOT_PX / slotMinutes);
  const height = (closeMinute - openMinute) * pxPerMinute;
  const slots: number[] = [];
  for (let m = openMinute; m < closeMinute; m += slotMinutes) slots.push(m);
  const hourLabels: number[] = [];
  for (let m = Math.ceil(openMinute / 60) * 60; m < closeMinute; m += 60) hourLabels.push(m);

  const today = kstToday();

  // 그 열(날짜)의 운영 시간 안으로 잘라 위치·높이 계산 (밖이면 null)
  const place = (startIso: string, endIso: string, date: string) => {
    const start = Math.max(minutesFromDayStart(startIso, date), openMinute);
    const end = Math.min(minutesFromDayStart(endIso, date), closeMinute);
    if (end <= start) return null;
    return { top: (start - openMinute) * pxPerMinute, height: (end - start) * pxPerMinute };
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid min-w-fit" style={{ gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(8rem, 1fr))` }}>
        {/* 머리글 */}
        <div className="sticky left-0 z-20 border-b bg-sidebar" />
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              "border-b border-l px-2 py-2 text-center",
              column.highlight && "text-primary",
              column.closed && "text-muted-foreground",
            )}
          >
            <div className="truncate font-medium">{column.label}</div>
            {column.sublabel && <div className="truncate text-xs text-muted-foreground">{column.sublabel}</div>}
          </div>
        ))}

        {/* 시간 축 */}
        <div className="sticky left-0 z-20 bg-sidebar" style={{ height }}>
          <div className="relative h-full">
            {hourLabels.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: (m - openMinute) * pxPerMinute }}
              >
                {m === openMinute ? "" : formatHm(m)}
              </span>
            ))}
            <span className="absolute top-1 right-2 text-xs text-muted-foreground tabular-nums">{formatHm(openMinute)}</span>
          </div>
        </div>

        {/* 열 */}
        {columns.map((column) => {
          const columnReservations = reservations.filter((r) => r.facilityId === column.facilityId);
          const columnUnavailable = unavailable.filter((u) => u.facilityId === column.facilityId);
          const nowMinute = column.date === today ? minutesFromDayStart(new Date().toISOString(), today) : null;

          return (
            <div key={column.key} className={cn("relative border-l", column.closed && "bg-muted/40")} style={{ height }}>
              {/* 빈 칸 (예약 만들기) */}
              {slots.map((m) => {
                const disabled = column.closed || !isFutureSlot(column.date, m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    aria-label={`${column.label} ${formatHm(m)} 예약`}
                    onClick={() => onSlotClick(column, m)}
                    className={cn(
                      "absolute inset-x-0 border-t border-border/50",
                      (m - openMinute) % 60 === 0 && "border-border",
                      disabled ? "cursor-default bg-muted/30" : "hover:bg-primary/5 focus-visible:bg-primary/10 focus-visible:outline-none",
                    )}
                    style={{ top: (m - openMinute) * pxPerMinute, height: slotMinutes * pxPerMinute }}
                  />
                );
              })}

              {/* 사용 불가 기간 */}
              {columnUnavailable.map((u) => {
                const pos = place(u.startAt, u.endAt, column.date);
                if (!pos) return null;
                return (
                  <div
                    key={`u-${u.id}`}
                    className="absolute inset-x-0.5 flex items-start gap-1 overflow-hidden rounded-sm border border-dashed border-muted-foreground/40 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--muted)_6px,var(--muted)_12px)] px-1.5 py-1 text-xs text-muted-foreground"
                    style={pos}
                    title={u.reason ?? "사용 불가"}
                  >
                    <Ban className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span className="truncate">{u.reason ?? "사용 불가"}</span>
                  </div>
                );
              })}

              {/* 예약 */}
              {columnReservations.map((r) => {
                const pos = place(r.startAt, r.endAt, column.date);
                if (!pos) return null;
                return (
                  <button
                    key={`r-${r.id}`}
                    type="button"
                    onClick={() => onReservationClick(r)}
                    className={cn(
                      "absolute inset-x-0.5 overflow-hidden rounded-sm border px-1.5 py-1 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      r.isMine
                        ? "border-primary/40 bg-primary/15 text-foreground hover:bg-primary/20"
                        : "border-border bg-secondary text-secondary-foreground hover:bg-accent",
                    )}
                    style={pos}
                  >
                    <span className="block truncate font-medium">{r.title || "예약"}</span>
                    <span className="block truncate text-muted-foreground">{r.user.name}</span>
                  </button>
                );
              })}

              {/* 현재 시각 */}
              {nowMinute !== null && nowMinute > openMinute && nowMinute < closeMinute && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive/70"
                  style={{ top: (nowMinute - openMinute) * pxPerMinute }}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
