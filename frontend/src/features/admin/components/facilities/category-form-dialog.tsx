"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import type { FacilityCategoryInput } from "@/services/api/facility-categories";
import { WEEKDAY_LABEL, type FacilityCategory } from "@/types/reservation";

export type CategoryDialogState = { mode: "add" } | { mode: "edit"; category: FacilityCategory } | null;

interface CategoryFormDialogProps {
  state: CategoryDialogState;
  onClose: () => void;
  pending: boolean;
  error: unknown;
  onSubmit: (input: FacilityCategoryInput) => void;
}

const toMinute = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

// 시설 분류 추가·수정 (예약 규칙: 단위·운영 시간·운영 요일·예약 가능 기간)
// - 규칙을 바꿔도 이미 있는 예약은 그대로이고 새 예약부터 적용된다. (서버 규칙)
// - <input type="time">은 24:00을 고를 수 없어 "자정까지" 체크로 받는다.
export function CategoryFormDialog({ state, onClose, ...props }: CategoryFormDialogProps) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && !props.pending && onClose()}>
      <DialogContent className="sm:max-w-lg">{state && <CategoryForm state={state} onCancel={onClose} {...props} />}</DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  state,
  pending,
  error,
  onSubmit,
  onCancel,
}: Omit<CategoryFormDialogProps, "state" | "onClose"> & { state: NonNullable<CategoryDialogState>; onCancel: () => void }) {
  const editing = state.mode === "edit" ? state.category : null;

  const [name, setName] = useState(editing?.name ?? "");
  const [slotMinutes, setSlotMinutes] = useState(String(editing?.slotMinutes ?? 30));
  const [openTime, setOpenTime] = useState(editing?.openTime ?? "09:00");
  const [untilMidnight, setUntilMidnight] = useState(editing?.closeTime === "24:00");
  const [closeTime, setCloseTime] = useState(editing && editing.closeTime !== "24:00" ? editing.closeTime : "18:00");
  const [operatingDays, setOperatingDays] = useState<number[]>(editing?.operatingDays ?? [1, 2, 3, 4, 5]);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(String(editing?.maxAdvanceDays ?? 90));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const slot = Number(slotMinutes);
    const advance = Number(maxAdvanceDays);
    const close = untilMidnight ? "24:00" : closeTime;
    const next: Record<string, string> = {};

    if (!name.trim()) next.name = "분류명을 입력해 주세요.";
    else if (name.trim().length > 50) next.name = "분류명은 50자 이하로 입력해 주세요.";
    if (!Number.isInteger(slot) || slot < 5 || slot > 720) next.slot = "5~720분 사이 정수로 입력해 주세요.";
    if (!openTime) next.open = "운영 시작을 입력해 주세요.";
    if (!untilMidnight && !closeTime) next.close = "운영 종료를 입력해 주세요.";
    if (openTime && close && !next.slot) {
      const span = toMinute(close) - toMinute(openTime);
      if (span <= 0) next.close = "운영 종료는 시작보다 뒤여야 합니다.";
      else if (span % slot !== 0) next.close = `운영 시간이 예약 단위(${slot}분)로 나누어떨어져야 합니다.`;
    }
    if (operatingDays.length === 0) next.days = "운영 요일을 하나 이상 골라 주세요.";
    if (!Number.isInteger(advance) || advance < 1 || advance > 365) next.advance = "1~365일 사이 정수로 입력해 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    onSubmit({
      name: name.trim(),
      slotMinutes: slot,
      openTime,
      closeTime: close,
      operatingDays: [...operatingDays].sort((a, b) => a - b),
      maxAdvanceDays: advance,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? "시설 분류 수정" : "시설 분류 추가"}</DialogTitle>
        <DialogDescription>
          분류의 규칙은 그 분류의 모든 시설에 적용됩니다.{editing && " 규칙을 바꿔도 이미 있는 예약은 그대로입니다."}
        </DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      <FormField id="category-name" label="분류명" required error={errors.name}>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 회의실" autoFocus autoComplete="off" aria-invalid={!!errors.name} aria-describedby="category-name-message" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="category-slot" label="예약 단위(분)" required error={errors.slot}>
          <Input id="category-slot" type="number" inputMode="numeric" min={5} max={720} step={5} value={slotMinutes} onChange={(e) => setSlotMinutes(e.target.value)} aria-invalid={!!errors.slot} aria-describedby="category-slot-message" />
        </FormField>
        <FormField id="category-advance" label="예약 가능 기간(일)" required error={errors.advance} hint="오늘부터 며칠 뒤까지">
          <Input id="category-advance" type="number" inputMode="numeric" min={1} max={365} value={maxAdvanceDays} onChange={(e) => setMaxAdvanceDays(e.target.value)} aria-invalid={!!errors.advance} aria-describedby="category-advance-message" />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="category-open" label="운영 시작" required error={errors.open}>
          <Input id="category-open" type="time" step={300} value={openTime} onChange={(e) => setOpenTime(e.target.value)} aria-invalid={!!errors.open} aria-describedby="category-open-message" />
        </FormField>
        <FormField id="category-close" label="운영 종료" required error={errors.close}>
          <Input id="category-close" type="time" step={300} value={closeTime} disabled={untilMidnight} onChange={(e) => setCloseTime(e.target.value)} aria-invalid={!!errors.close} aria-describedby="category-close-message" />
          <div className="flex items-center gap-2">
            <Checkbox id="category-midnight" checked={untilMidnight} onCheckedChange={(v) => setUntilMidnight(v === true)} />
            <Label htmlFor="category-midnight" className="text-xs font-normal">
              자정(24:00)까지
            </Label>
          </div>
        </FormField>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">
          운영 요일<span className="text-destructive" aria-hidden>*</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const selected = operatingDays.includes(d);
            return (
              <Button
                key={d}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={selected}
                onClick={() => setOperatingDays((prev) => (selected ? prev.filter((x) => x !== d) : [...prev, d]))}
                className={cn("w-9", selected && "border-primary bg-primary/10 text-primary")}
              >
                {WEEKDAY_LABEL[d]}
              </Button>
            );
          })}
        </div>
        {errors.days && <p className="text-xs text-destructive">{errors.days}</p>}
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {editing ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </form>
  );
}
