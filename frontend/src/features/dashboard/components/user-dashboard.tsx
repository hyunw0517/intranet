"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEnabledAddons } from "@/features/addon/hooks/use-addons";
import { useApprovalCounts } from "@/features/approval/hooks/use-approvals";
import { eventDateSpan } from "@/lib/calendar-month";
import { useLeaveCalendar, useMyLeaveSummary } from "@/features/leave/hooks/use-leaves";
import { useMyTasks } from "@/features/project/hooks/use-projects";
import { formatListDate, toKstParts } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TASK_STATUS_LABEL } from "@/types/project";
import { dayRange, todayRange, useDayEvents, useDayMyReservations, useRecentNotices } from "../hooks/use-dashboard";
import { CardEmpty, CardState, DashboardCard, StatTile } from "./dashboard-card";
import { ScheduleCalendar } from "./schedule-calendar";

const MAX_TASKS = 5;

// 사용자 대시보드: 꺼진 애드온의 카드는 만들지 않는다 (그 API도 호출되지 않는다)
export function UserDashboard() {
  const { data: addons, isPending } = useEnabledAddons();
  if (isPending) return null;

  const enabled = addons?.enabled ?? [];
  const approvals = enabled.includes("approvals");
  const leaves = enabled.includes("leaves");
  const reservations = enabled.includes("reservations");
  const projects = enabled.includes("projects");

  return (
    <div className="grid gap-4">
      {(approvals || leaves) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {approvals && <ApprovalTiles />}
          {leaves && <LeaveTile />}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ScheduleCard reservations={reservations} leaves={leaves} />
        <RecentNoticesCard />
        {projects && <MyTasksCard />}
      </div>
    </div>
  );
}

function ApprovalTiles() {
  const { data } = useApprovalCounts();
  return (
    <>
      <StatTile label="결재 대기" value={data?.pending} unit="건" href="/approvals?box=pending" />
      <StatTile label="진행 중인 내 문서" value={data?.mine} unit="건" href="/approvals?box=mine" />
      <StatTile label="임시저장" value={data?.drafts} unit="건" href="/approvals?box=drafts" />
    </>
  );
}

function LeaveTile() {
  const { data } = useMyLeaveSummary(new Date().getFullYear());
  return <StatTile label="남은 연차" value={data?.remainingDays} unit="일" href="/leaves" />;
}

type ScheduleTab = "schedule" | "calendar";

// 일정 카드: [일정] 탭은 고른 날짜(기본 오늘)의 일정, [달력] 탭은 날짜를 고르는 월 달력
function ScheduleCard({ reservations, leaves }: { reservations: boolean; leaves: boolean }) {
  const today = todayRange().date;
  const [tab, setTab] = useState<ScheduleTab>("schedule");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate ?? today;
  const isToday = date === today;
  const [, month, day] = date.split("-").map(Number);
  const dateLabel = isToday ? "오늘" : `${month}월 ${day}일`;

  const selectDate = (next: string) => {
    setPickedDate(next);
    setTab("schedule");
  };

  return (
    <DashboardCard
      title={tab === "calendar" ? "달력" : `${dateLabel} 일정`}
      actions={
        <>
          {tab === "schedule" && !isToday && (
            <Button variant="outline" size="sm" onClick={() => setPickedDate(null)}>
              오늘
            </Button>
          )}
          <Tabs value={tab} onValueChange={(value) => setTab(value as ScheduleTab)}>
            <TabsList>
              <TabsTrigger value="schedule">일정</TabsTrigger>
              <TabsTrigger value="calendar">달력</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      {tab === "calendar" ? (
        <ScheduleCalendar selected={date} today={today} onSelect={selectDate} />
      ) : (
        <DaySchedule date={date} dateLabel={dateLabel} reservations={reservations} leaves={leaves} />
      )}
    </DashboardCard>
  );
}

interface ScheduleRow {
  key: string;
  time: string;
  title: string;
  meta: string;
  href: string;
}

// 종일 일정을 맨 위에, 나머지는 시각 순으로 둔다.
const scheduleOrder = (time: string) => (time === "종일" ? "" : time);

function DaySchedule({
  date,
  dateLabel,
  reservations,
  leaves,
}: {
  date: string;
  dateLabel: string;
  reservations: boolean;
  leaves: boolean;
}) {
  const range = dayRange(date);
  const events = useDayEvents(range);
  const myReservations = useDayMyReservations(range, reservations);
  const leaveCalendar = useLeaveCalendar(range, leaves);

  // 게시판 달력과 같은 기준으로 그날에 걸친 일정만 남긴다. (전날 끝나는 24:00 종료 일정 제외)
  const dayEvents = (events.data?.events ?? []).filter((event) => {
    const { from, to } = eventDateSpan(event);
    return from <= date && date <= to;
  });

  const rows: ScheduleRow[] = [
    ...dayEvents.map((event) => ({
      key: `event-${event.id}`,
      // 전날 시작해 이어지는 일정은 종일처럼 표시한다.
      time: event.isAllDay || toKstParts(event.eventStartAt).date !== date ? "종일" : toKstParts(event.eventStartAt).time,
      title: event.title,
      meta: "일정",
      href: `/boards/${event.boardId}/posts/${event.id}`,
    })),
    ...(myReservations.data?.data ?? []).map((reservation) => ({
      key: `reservation-${reservation.id}`,
      time: toKstParts(reservation.startAt).time,
      title: reservation.title || reservation.facility.name,
      meta: reservation.facility.name,
      href: "/reservations/me",
    })),
  ].sort((a, b) => scheduleOrder(a.time).localeCompare(scheduleOrder(b.time)));

  const onLeave = leaveCalendar.data?.find((day) => day.date === date);
  const failed = events.error ?? myReservations.error ?? leaveCalendar.error;
  const retry = () => {
    if (events.isError) void events.refetch();
    if (myReservations.isError) void myReservations.refetch();
    if (leaveCalendar.isError) void leaveCalendar.refetch();
  };

  return (
    <CardState isLoading={events.isLoading || myReservations.isLoading || leaveCalendar.isLoading} error={failed} onRetry={retry}>
      {rows.length === 0 ? (
        <CardEmpty message={`${dateLabel} 예정된 일정이 없습니다.`} />
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.key}>
              <Link href={row.href} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                <span className="w-11 shrink-0 text-sm tabular-nums text-muted-foreground">{row.time}</span>
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <span className="max-w-28 shrink-0 truncate text-xs text-muted-foreground">{row.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {onLeave && onLeave.count > 0 && (
        <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
          {dateLabel} 휴가 {onLeave.count}명: {onLeave.people.map((person) => person.name).join(", ")}
        </p>
      )}
    </CardState>
  );
}

function RecentNoticesCard() {
  const { data, isLoading, error, refetch } = useRecentNotices();

  return (
    <DashboardCard title="최근 공지">
      <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data?.length === 0 ? (
          <CardEmpty message="등록된 공지가 없습니다." />
        ) : (
          <ul className="divide-y">
            {data?.map((notice) => (
              <li key={notice.id}>
                <Link href={`/boards/${notice.boardId}/posts/${notice.id}`} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                  <span className="min-w-0 flex-1 truncate">{notice.title}</span>
                  <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">{notice.board.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatListDate(notice.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardState>
    </DashboardCard>
  );
}

function MyTasksCard() {
  const { data, isLoading, error, refetch } = useMyTasks();
  const today = todayRange().date;

  return (
    <DashboardCard title="내 할 일" href="/projects/my-tasks" className="lg:col-span-2">
      <CardState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data?.length === 0 ? (
          <CardEmpty message="담당한 미완료 과제가 없습니다." />
        ) : (
          <ul className="divide-y">
            {data?.slice(0, MAX_TASKS).map((task) => {
              const due = task.dueDate?.slice(0, 10) ?? null;
              const urgent = !!due && due <= today;
              return (
                <li key={task.id}>
                  <Link href={`/projects/${task.project.id}?task=${task.id}`} className="flex items-center gap-3 py-2 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{task.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{task.project.name}</span>
                    </span>
                    <Badge variant={task.status === "IN_PROGRESS" ? "default" : "outline"}>{TASK_STATUS_LABEL[task.status]}</Badge>
                    <span className={cn("w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground", urgent && "text-destructive")}>
                      {due ?? "마감일 없음"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardState>
    </DashboardCard>
  );
}
