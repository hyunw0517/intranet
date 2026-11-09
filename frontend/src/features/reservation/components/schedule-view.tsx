"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABEL, type FacilityCategory, type Reservation } from "@/types/reservation";
import { useFacilities, useFacilityCategories, useSchedule } from "../hooks/use-reservations";
import { addDays, formatShortDate, kstIso, kstToday, weekdayOf, weekStart } from "../reservation-time";
import { ReservationDetailDialog } from "./reservation-detail-dialog";
import { ReservationFormDialog, type ReservationFormState } from "./reservation-form-dialog";
import { TimeGrid, type TimeGridColumn } from "./time-grid";

type ViewMode = "day" | "week";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 시설 예약 시간표
// - 분류 탭 + 날짜 이동 + 보기 전환(하루: 분류의 시설별 열 / 주간: 시설 하나의 월~일) (2026-11-09 사용자 결정)
// - 보고 있는 분류·날짜·보기·시설은 URL(?category=&date=&view=week&facility=)에 둔다. (새로고침·뒤로 가기에도 유지)
// - 빈 칸을 누르거나 [예약]을 누르면 예약 창, 예약을 누르면 상세(권한이 있으면 수정·취소·삭제)
export function ScheduleView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = kstToday();
  const rawDate = searchParams.get("date");
  const date = rawDate && DATE_REGEX.test(rawDate) ? rawDate : today;
  const view: ViewMode = searchParams.get("view") === "week" ? "week" : "day";

  const categoriesQuery = useFacilityCategories();
  const categories = categoriesQuery.data ?? [];
  const categoryParam = Number(searchParams.get("category"));
  const category = categories.find((c) => c.id === categoryParam) ?? categories[0];

  const facilitiesQuery = useFacilities(category?.id);
  const facilities = facilitiesQuery.data ?? [];
  const facilityParam = Number(searchParams.get("facility"));
  const weekFacility = facilities.find((f) => f.id === facilityParam) ?? facilities[0];

  const monday = weekStart(date);
  const scheduleQuery = !category
    ? null
    : view === "day"
      ? { categoryId: category.id, from: kstIso(date, 0), to: kstIso(addDays(date, 1), 0) }
      : weekFacility
        ? { facilityId: weekFacility.id, from: kstIso(monday, 0), to: kstIso(addDays(monday, 7), 0) }
        : null;
  const schedule = useSchedule(scheduleQuery);

  const [form, setForm] = useState<ReservationFormState>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const go = (next: { category?: number; date?: string; view?: ViewMode; facility?: number }) => {
    const params = new URLSearchParams();
    const nextCategory = next.category ?? category?.id;
    if (nextCategory) params.set("category", String(nextCategory));
    params.set("date", next.date ?? date);
    if ((next.view ?? view) === "week") params.set("view", "week");
    // 분류를 바꾸면 시설 선택은 새 분류의 첫 시설로
    const nextFacility = next.category !== undefined ? undefined : (next.facility ?? weekFacility?.id);
    if (nextFacility) params.set("facility", String(nextFacility));
    router.replace(`${pathname}?${params}`, { scroll: false });
  };

  const openCreate = (rules: FacilityCategory, facilityId: number, slotDate: string, startMinute?: number) =>
    setForm({ mode: "create", rules, facilities, facilityId, date: slotDate, startMinute });

  const openEdit = (reservation: Reservation) => {
    if (!category) return;
    setDetailId(null);
    setForm({ mode: "edit", rules: category, reservation });
  };

  if (categoriesQuery.isPending) return <LoadingState />;
  if (categoriesQuery.isError) return <ErrorState error={categoriesQuery.error} onRetry={() => categoriesQuery.refetch()} />;
  if (!category) return <EmptyState message="등록된 시설이 없습니다. 관리자에게 문의해 주세요." />;

  const step = view === "day" ? 1 : 7;
  const dayClosed = !category.operatingDays.includes(weekdayOf(date));

  const columns: TimeGridColumn[] =
    view === "day"
      ? (schedule.data?.facilities ?? []).map((f) => ({
          key: `f-${f.id}`,
          label: f.name,
          sublabel: [f.location, f.capacity ? `${f.capacity}명` : null].filter(Boolean).join(" · ") || undefined,
          date,
          facilityId: f.id,
          closed: dayClosed,
        }))
      : weekFacility
        ? Array.from({ length: 7 }, (_, i) => {
            const d = addDays(monday, i);
            return {
              key: `d-${d}`,
              label: formatShortDate(d),
              date: d,
              facilityId: weekFacility.id,
              closed: !category.operatingDays.includes(weekdayOf(d)),
              highlight: d === today,
            };
          })
        : [];

  const firstBookableFacility = view === "week" ? weekFacility?.id : facilities[0]?.id;

  return (
    <div className="grid gap-4">
      {/* 분류 탭 */}
      <div role="tablist" aria-label="시설 분류" className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <Button
            key={c.id}
            role="tab"
            aria-selected={c.id === category.id}
            variant="ghost"
            size="sm"
            onClick={() => go({ category: c.id })}
            className={cn(c.id === category.id ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            {c.name}
          </Button>
        ))}
      </div>

      {/* 날짜 이동 · 보기 전환 · 예약 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label={view === "day" ? "이전 날" : "이전 주"} onClick={() => go({ date: addDays(date, -step) })}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-36 text-center font-semibold tabular-nums" aria-live="polite">
            {view === "day" ? formatShortDate(date) : `${formatShortDate(monday)} ~ ${formatShortDate(addDays(monday, 6))}`}
          </h2>
          <Button variant="outline" size="icon-sm" aria-label={view === "day" ? "다음 날" : "다음 주"} onClick={() => go({ date: addDays(date, step) })}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go({ date: today })}>
            오늘
          </Button>
          <Input
            type="date"
            aria-label="날짜 선택"
            value={date}
            onChange={(e) => DATE_REGEX.test(e.target.value) && go({ date: e.target.value })}
            className="h-7 w-36"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "week" && facilities.length > 0 && (
            <Select value={String(weekFacility?.id ?? "")} onValueChange={(v) => go({ facility: Number(v) })}>
              <SelectTrigger size="sm" className="w-40" aria-label="시설 선택">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {facilities.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div role="group" aria-label="보기 방식" className="flex rounded-lg border p-0.5">
            {(
              [
                { mode: "day", label: "하루", icon: CalendarDays },
                { mode: "week", label: "주간", icon: CalendarRange },
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

          <Button
            size="sm"
            disabled={!firstBookableFacility}
            onClick={() => firstBookableFacility && openCreate(category, firstBookableFacility, date < today ? today : date)}
          >
            <Plus aria-hidden />
            예약
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        운영 {category.openTime}~{category.closeTime} · {category.slotMinutes}분 단위 · {category.operatingDays.map((d) => WEEKDAY_LABEL[d]).join("·")} ·
        오늘부터 {category.maxAdvanceDays}일 뒤까지 예약 가능. 빈 칸을 누르면 그 시각으로 예약합니다.
      </p>

      {view === "day" && dayClosed && (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          {WEEKDAY_LABEL[weekdayOf(date)]}요일은 운영하지 않습니다.
        </p>
      )}

      {/* 주간 보기에서 시설이 없으면 조회하지 않는다(scheduleQuery = null) → 아래 빈 상태 */}
      {facilitiesQuery.isPending || (scheduleQuery !== null && schedule.isPending) ? (
        <LoadingState />
      ) : schedule.isError ? (
        <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />
      ) : columns.length === 0 ? (
        <EmptyState message="이 분류에 예약할 수 있는 시설이 없습니다." />
      ) : (
        <div className={cn(schedule.isPlaceholderData && "opacity-60 transition-opacity")}>
          <TimeGrid
            columns={columns}
            rules={category}
            reservations={schedule.data?.reservations ?? []}
            unavailable={schedule.data?.unavailable ?? []}
            onSlotClick={(column, minute) => openCreate(category, column.facilityId, column.date, minute)}
            onReservationClick={(r) => setDetailId(r.id)}
          />
        </div>
      )}

      <ReservationFormDialog state={form} onClose={() => setForm(null)} />
      <ReservationDetailDialog reservationId={detailId} onClose={() => setDetailId(null)} onEdit={openEdit} />
    </div>
  );
}
