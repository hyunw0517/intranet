"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import {
  createRecurringReservation,
  createReservation,
  updateReservation,
  type RecurringReservationInput,
} from "@/services/api/reservations";
import { SKIP_REASON_LABEL, WEEKDAY_LABEL, type RecurringResult, type Reservation, type ReservationRules } from "@/types/reservation";
import { useReservationMutation } from "../hooks/use-reservations";
import {
  addDays,
  endOptions,
  formatHm,
  formatShortDate,
  isFutureSlot,
  kstIso,
  kstToday,
  lastBookableDate,
  startOptions,
  toDateMinute,
  weekdayOf,
} from "../reservation-time";

export type ReservationFormState =
  | {
      mode: "create";
      rules: ReservationRules;
      facilities: { id: number; name: string }[]; // 같은 분류의 시설 (규칙이 같으므로 바꿔 골라도 된다)
      facilityId: number;
      date: string;
      startMinute?: number; // 시간표 빈 칸을 눌렀으면 그 시각
    }
  | { mode: "edit"; rules: ReservationRules; reservation: Reservation }
  | null;

// 예약 만들기(단건·반복)·수정 창
// - 시각 선택지는 분류 규칙(운영 시간·예약 단위)으로 만든다. 날짜는 오늘 ~ 예약 가능 마지막 날
// - 규칙의 최종 확인과 겹침 확인은 서버가 한다. (400·409 메시지를 그대로 보여 준다)
export function ReservationFormDialog({ state, onClose }: { state: ReservationFormState; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* 열 때마다 새로 마운트해 이전 입력이 남지 않게 한다. */}
        {state && <ReservationForm state={state} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

type Tab = "once" | "recurring";

// 처음 값: 수정이면 기존 예약의 날짜·시각, 만들기면 넘겨받은 날짜와 (누른 칸 또는 첫 예약 가능 칸) + 두 칸
function initialValues(state: NonNullable<ReservationFormState>) {
  const { rules } = state;
  if (state.mode === "edit") {
    const start = toDateMinute(state.reservation.startAt);
    const end = toDateMinute(state.reservation.endAt);
    // 24:00에 끝나는 예약은 종료가 다음 날 00:00이므로 1440으로 본다.
    return { date: start.date, start: start.minute, end: end.minute + (end.date !== start.date ? 1440 : 0) };
  }
  const first = startOptions(rules).find((m) => isFutureSlot(state.date, m));
  const start = state.startMinute ?? first ?? rules.openMinute;
  return { date: state.date, start, end: Math.min(start + rules.slotMinutes * 2, rules.closeMinute) };
}

function ReservationForm({
  state,
  onClose,
  onBusyChange,
}: {
  state: NonNullable<ReservationFormState>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const editing = state.mode === "edit" ? state.reservation : null;
  const rules = state.rules;
  const today = kstToday();
  const lastDate = lastBookableDate(rules);

  const initial = initialValues(state);

  const [tab, setTab] = useState<Tab>("once");
  const [facilityId, setFacilityId] = useState(editing ? editing.facilityId : state.mode === "create" ? state.facilityId : 0);
  const [date, setDate] = useState(initial.date);
  const [startMinute, setStartMinute] = useState(initial.start);
  const [endMinute, setEndMinute] = useState(initial.end);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  // 반복
  const [endDate, setEndDate] = useState(addDays(initial.date, 28) > lastDate ? lastDate : addDays(initial.date, 28));
  const [weekdays, setWeekdays] = useState<number[]>(() => {
    const day = weekdayOf(initial.date);
    return rules.operatingDays.includes(day) ? [day] : [];
  });
  const [errors, setErrors] = useState<{ date?: string; endDate?: string; weekdays?: string; title?: string; description?: string }>({});
  const [recurringResult, setRecurringResult] = useState<RecurringResult | null>(null);

  const once = useReservationMutation(createReservation);
  const recurring = useReservationMutation(createRecurringReservation);
  const update = useReservationMutation(({ id, input }: { id: number; input: Parameters<typeof updateReservation>[1] }) =>
    updateReservation(id, input),
  );
  const mutation = editing ? update : tab === "once" ? once : recurring;
  const pending = mutation.isPending;

  const setPending = (value: boolean) => onBusyChange(value);

  // 시작 시각 선택지 (오늘이면 지난 시각 제외, 수정 중이면 기존 시각도 넣는다 - 분류 규칙이 바뀌었을 수 있으므로)
  const isRecurring = !editing && tab === "recurring";
  const starts = startOptions(rules).filter((m) => isRecurring || date !== today || isFutureSlot(date, m));
  if (editing && !starts.includes(initial.start) && date === initial.date) starts.unshift(initial.start);
  const ends = endOptions(rules, startMinute);
  if (editing && !ends.includes(endMinute) && endMinute > startMinute) ends.push(endMinute);

  const changeStart = (value: number) => {
    setStartMinute(value);
    // 종료가 시작보다 앞이 되면 한 칸 뒤로 맞춘다.
    if (endMinute <= value) setEndMinute(Math.min(value + rules.slotMinutes, rules.closeMinute));
  };

  const validate = () => {
    const next: typeof errors = {};
    if (!date) next.date = "날짜를 선택해 주세요.";
    else if (date < today) next.date = "오늘 이후 날짜를 선택해 주세요.";
    else if (date > lastDate) next.date = `${lastDate}까지 예약할 수 있습니다.`;
    if (isRecurring) {
      if (!endDate) next.endDate = "종료일을 선택해 주세요.";
      else if (endDate < date) next.endDate = "종료일은 시작일과 같거나 뒤여야 합니다.";
      else if (endDate > lastDate) next.endDate = `${lastDate}까지 예약할 수 있습니다.`;
      if (weekdays.length === 0) next.weekdays = "요일을 하나 이상 골라 주세요.";
    }
    if (title.trim().length > 100) next.title = "제목은 100자 이하로 입력해 주세요.";
    if (description.trim().length > 500) next.description = "설명은 500자 이하로 입력해 주세요.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || !validate()) return;

    const common = { title: title.trim() || null, description: description.trim() || null };
    setPending(true);
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          input: { startAt: kstIso(date, startMinute), endAt: kstIso(date, endMinute), ...common },
        });
        toast.success("예약을 수정했습니다.");
        onClose();
      } else if (tab === "once") {
        await once.mutateAsync({ facilityId, startAt: kstIso(date, startMinute), endAt: kstIso(date, endMinute), ...common });
        toast.success("예약했습니다.");
        onClose();
      } else {
        const input: RecurringReservationInput = {
          facilityId,
          startDate: date,
          endDate,
          weekdays: [...weekdays].sort((a, b) => a - b),
          startTime: formatHm(startMinute),
          endTime: formatHm(endMinute),
          ...common,
        };
        setRecurringResult(await recurring.mutateAsync(input));
      }
    } catch {
      // 오류는 mutation.error로 폼 위에 표시한다.
    } finally {
      setPending(false);
    }
  };

  // 반복 예약 결과 (만든 날짜 수 + 건너뛴 날짜와 이유)
  if (recurringResult) {
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>반복 예약 결과</DialogTitle>
          <DialogDescription>
            {recurringResult.created.length > 0
              ? `${recurringResult.created.length}건을 예약했습니다.`
              : "예약된 날짜가 없습니다."}
            {recurringResult.skipped.length > 0 && ` ${recurringResult.skipped.length}건은 건너뛰었습니다.`}
          </DialogDescription>
        </DialogHeader>
        {recurringResult.skipped.length > 0 && (
          <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
            {recurringResult.skipped.map((s) => (
              <li key={s.date} className="flex justify-between gap-4 px-3 py-2">
                <span className="tabular-nums">{formatShortDate(s.date)}</span>
                <span className="text-muted-foreground">{SKIP_REASON_LABEL[s.reason]}</span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button onClick={onClose}>
            <CheckCircle2 aria-hidden />
            확인
          </Button>
        </DialogFooter>
      </div>
    );
  }

  const facilities = state.mode === "create" ? state.facilities : [];

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "예약 수정" : "시설 예약"}</DialogTitle>
        <DialogDescription>
          {editing
            ? `${editing.facility.name} · 시설은 바꿀 수 없습니다. 다른 시설은 취소 후 다시 예약해 주세요.`
            : `운영 시간 ${formatHm(rules.openMinute)}~${formatHm(rules.closeMinute)}, ${rules.slotMinutes}분 단위, 운영 요일 ${rules.operatingDays.map((d) => WEEKDAY_LABEL[d]).join("·")}`}
        </DialogDescription>
      </DialogHeader>

      {!editing && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="once">한 번</TabsTrigger>
            <TabsTrigger value="recurring">반복</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />

      {!editing && (
        <FormField id="reservation-facility" label="시설" required>
          <Select value={String(facilityId)} onValueChange={(v) => setFacilityId(Number(v))}>
            <SelectTrigger id="reservation-facility" className="w-full">
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
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="reservation-date" label={isRecurring ? "시작일" : "날짜"} required error={errors.date}>
          <Input
            id="reservation-date"
            type="date"
            value={date}
            min={today}
            max={lastDate}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!errors.date}
            aria-describedby="reservation-date-message"
          />
        </FormField>
        {isRecurring && (
          <FormField id="reservation-end-date" label="종료일" required error={errors.endDate}>
            <Input
              id="reservation-end-date"
              type="date"
              value={endDate}
              min={date}
              max={lastDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={!!errors.endDate}
              aria-describedby="reservation-end-date-message"
            />
          </FormField>
        )}
      </div>

      {isRecurring && (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            반복 요일<span className="text-destructive" aria-hidden>*</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const operating = rules.operatingDays.includes(d);
              const selected = weekdays.includes(d);
              return (
                <Button
                  key={d}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!operating}
                  aria-pressed={selected}
                  onClick={() => setWeekdays((prev) => (selected ? prev.filter((x) => x !== d) : [...prev, d]))}
                  className={cn("w-9", selected && "border-primary bg-primary/10 text-primary")}
                >
                  {WEEKDAY_LABEL[d]}
                </Button>
              );
            })}
          </div>
          <p className={cn("text-xs", errors.weekdays ? "text-destructive" : "text-muted-foreground")}>
            {errors.weekdays ?? "이미 예약된 날·사용 불가 기간은 건너뛰고 나머지만 예약합니다."}
          </p>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-4">
        <FormField id="reservation-start" label="시작" required>
          <Select value={String(startMinute)} onValueChange={(v) => changeStart(Number(v))}>
            <SelectTrigger id="reservation-start" className="w-full">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {starts.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {formatHm(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="reservation-end" label="종료" required>
          <Select value={String(endMinute)} onValueChange={(v) => setEndMinute(Number(v))}>
            <SelectTrigger id="reservation-end" className="w-full">
              <SelectValue placeholder="선택" />
            </SelectTrigger>
            <SelectContent>
              {ends.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {formatHm(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField id="reservation-title" label="제목" error={errors.title} hint="시간표에 예약자 이름과 함께 모든 직원에게 보입니다.">
        <Input
          id="reservation-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 주간 회의"
          autoComplete="off"
          aria-invalid={!!errors.title}
          aria-describedby="reservation-title-message"
        />
      </FormField>

      <FormField id="reservation-description" label="설명" error={errors.description}>
        <Textarea
          id="reservation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          aria-invalid={!!errors.description}
          aria-describedby="reservation-description-message"
        />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending || facilityId === 0}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : isRecurring ? "반복 예약" : "예약"}
        </Button>
      </DialogFooter>
    </form>
  );
}
