"use client";

import { FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LEAVE_TYPE_LABEL, LEAVE_UNIT_LABEL, type LeaveType, type LeaveUnit } from "@/types/leave";
import { useMyLeaveSummary } from "../hooks/use-leaves";
import { formatDays, partialEndTime, previewDays, REASON_MAX, startTimeOptions, type LeaveFormValues } from "../leave-rules";

const TYPES: LeaveType[] = ["ANNUAL", "SICK", "OFFICIAL"];
const UNITS: LeaveUnit[] = ["FULL", "HALF", "QUARTER"];

// 전자결재 작성 화면의 휴가 입력 칸 (문서 유형이 "휴가 신청"일 때)
// - 종일은 달력 일수로 센다. 주말·공휴일 등 쉬는 날은 기간에서 빼고 나눠 신청한다(서버도 쉬는 날을 가정하지 않음).
// - 반차·반반차는 시작 시각만 고르고 종료는 4시간·2시간 뒤로 정해진다.
// - 연차면 그 연도의 남은 연차(결재 중 포함)를 함께 보여 준다. 최종 확인은 상신할 때 서버가 한다.
export function LeaveFields({
  value,
  onChange,
  error,
}: {
  value: LeaveFormValues;
  onChange: (next: LeaveFormValues) => void;
  error?: string;
}) {
  const set = (patch: Partial<LeaveFormValues>) => onChange({ ...value, ...patch });
  const days = previewDays(value);
  const year = Number((value.startDate || "").slice(0, 4)) || new Date().getFullYear();
  const summary = useMyLeaveSummary(year, value.type === "ANNUAL");

  return (
    <section className="grid gap-4 rounded-lg border p-4" aria-labelledby="leave-fields-label">
      <h2 id="leave-fields-label" className="text-sm font-semibold">
        휴가 정보
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="leave-type" label="휴가 유형" required>
          <Select value={value.type} onValueChange={(v) => set({ type: v as LeaveType })}>
            <SelectTrigger id="leave-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {LEAVE_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="grid gap-1.5">
          <Label id="leave-unit-label">
            사용 단위
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </Label>
          <div role="group" aria-labelledby="leave-unit-label" className="flex w-fit rounded-lg border p-0.5">
            {UNITS.map((u) => (
              <Button
                key={u}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={value.unit === u}
                onClick={() => set({ unit: u, endDate: value.startDate })}
                className={cn("h-7 px-3", value.unit === u && "bg-accent text-foreground")}
              >
                {LEAVE_UNIT_LABEL[u]}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {value.unit === "FULL" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="leave-start" label="시작일" required>
            <Input
              id="leave-start"
              type="date"
              value={value.startDate}
              // 종료일이 시작일보다 빠르면 같이 옮긴다
              onChange={(e) => set({ startDate: e.target.value, endDate: value.endDate < e.target.value ? e.target.value : value.endDate })}
            />
          </FormField>
          <FormField id="leave-end" label="종료일" required>
            <Input id="leave-end" type="date" value={value.endDate} min={value.startDate} onChange={(e) => set({ endDate: e.target.value })} />
          </FormField>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="leave-date" label="날짜" required>
            <Input id="leave-date" type="date" value={value.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: e.target.value })} />
          </FormField>
          <FormField id="leave-time" label="시작 시각" required hint={value.startTime ? `종료 ${partialEndTime(value.unit, value.startTime)}` : undefined}>
            <Select value={value.startTime} onValueChange={(v) => set({ startTime: v })}>
              <SelectTrigger id="leave-time" className="w-full" aria-describedby="leave-time-message">
                <SelectValue placeholder="시각 선택" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {startTimeOptions(value.unit).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t} ~ {partialEndTime(value.unit as "HALF" | "QUARTER", t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
      )}

      <FormField id="leave-reason" label="사유" hint={`${REASON_MAX}자 이하, 비워 두어도 됩니다.`}>
        <Textarea
          id="leave-reason"
          value={value.reason}
          maxLength={REASON_MAX}
          rows={2}
          onChange={(e) => set({ reason: e.target.value })}
          aria-describedby="leave-reason-message"
        />
      </FormField>

      <div className="grid gap-1 text-sm">
        <p>
          사용 일수 <span className="font-semibold tabular-nums">{days === null ? "-" : formatDays(days)}</span>
          {value.type === "ANNUAL" && summary.data && (
            <span className="ml-3 text-muted-foreground">
              {year}년 남은 연차 <span className="tabular-nums">{formatDays(summary.data.remainingDays)}</span> (결재 중 포함)
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          종일 휴가는 기간의 모든 날짜를 셉니다. 주말·공휴일 등 쉬는 날은 기간에서 빼고 나눠 신청하세요.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
