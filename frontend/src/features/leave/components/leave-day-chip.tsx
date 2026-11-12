"use client";

import { useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { LeaveCalendarDay, LeaveCalendarPerson } from "@/types/leave";

const CLOSE_DELAY_MS = 120; // 항목 → 명단으로 마우스를 옮기는 사이 닫히지 않게

// 캘린더 날짜 칸의 "휴가 N명" 항목 (캘린더 게시판의 "휴가자 표시" 옵션, 2026-11-12 사용자 결정)
// - 휴가자가 많아도 칸이 넘치지 않게 하루에 항목 하나만 그리고, 마우스를 올리면 명단을 보여 준다.
// - 터치 화면에는 마우스 올리기가 없으므로 누르면 열고 닫는다.
// - 명단: 이름(소속/직급): 휴가(종일) 또는 시각 (2026-11-12 사용자 결정). 휴가 유형(병가 등)은 서버가 보내지 않는다.
export function LeaveDayChip({ day, className }: { day: LeaveCalendarDay; className?: string }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointer = useRef<string>("");

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };
  // 마우스일 때만 올리기로 연다 (터치는 누르기로)
  const onPointerEnter = (e: React.PointerEvent) => e.pointerType === "mouse" && show();
  const onPointerLeave = (e: React.PointerEvent) => e.pointerType === "mouse" && hideSoon();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          // 마우스로 이미 열린 상태에서 누르면 Radix 기본 토글이 닫아 버리므로 막는다 (FE-12 결재선 접기와 같은 처리)
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          onClick={(e) => {
            if (open && lastPointer.current === "mouse") e.preventDefault();
          }}
          aria-label={`${day.date} 휴가 ${day.count}명, 명단 보기`}
          className={cn(
            // 초록색 (2026-11-12 사용자 요청 - 점선·회색은 잘 안 보임). 일정 박스(포인트색)와 구분된다.
            "flex min-w-0 items-center rounded border border-emerald-600/30 bg-emerald-600/15 px-1 py-0.5 text-left text-[11px] leading-4 text-emerald-800 hover:bg-emerald-600/25 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:px-1.5 sm:text-xs dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300 dark:hover:bg-emerald-400/25",
            className,
          )}
        >
          <span className="truncate">휴가 {day.count}명</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-3"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        // 마우스로 연 명단이 포커스를 가져가 칸 이동을 방해하지 않게
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {day.date} 휴가 {day.count}명
        </p>
        <ul className="grid max-h-64 gap-1.5 overflow-y-auto text-sm">
          {day.people.map((p) => (
            <li key={p.leaveId} className="flex min-w-0 justify-between gap-2">
              <span className="truncate">{personLabel(p)}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{p.unit === "FULL" ? "휴가" : `${p.startTime}~${p.endTime}`}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// 이름(소속/직급) - 없는 값은 뺀다
function personLabel(p: LeaveCalendarPerson) {
  const org = [p.departmentName, p.positionName].filter(Boolean).join("/");
  return org ? `${p.name}(${org})` : p.name;
}
