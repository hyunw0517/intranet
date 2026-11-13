"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/error-message";
import { createFacilityUnavailable, deleteFacilityUnavailable } from "@/services/api/facility-unavailable";
import type { Facility, FacilityUnavailable, UnavailableConflict } from "@/types/reservation";
import { formatHm, kstIso, kstToday, slotTimes } from "@/features/reservation/reservation-time";
import { useAdminFacilityMutation, useFacilityUnavailableList } from "../../hooks/use-admin-facilities";

// 시설의 사용 불가 기간 (점검 등) 관리
// - 겹치는 기존 예약이 있어도 저장되고, 응답의 conflicts를 경고로 보여 준다. 기존 예약은 그대로, 예약자 알림 없음 (2026-11-09 사용자 결정)
// - 그 기간의 새 예약은 서버가 막는다.
// - 시각은 분류의 예약 단위마다(00:00부터) 고른다. (2026-11-10, 시간이 애매하게 들어가지 않게)
//   예전 <input type="datetime-local" step>은 step을 강제하지 않아 13:04 같은 분이 들어갔다. (서버는 검사하지 않음 - 화면 표시 목적)
export function UnavailableDialog({ facility, onClose }: { facility: Facility | null; onClose: () => void }) {
  return (
    <Dialog open={facility !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">{facility && <UnavailableManager facility={facility} />}</DialogContent>
    </Dialog>
  );
}

function UnavailableManager({ facility }: { facility: Facility }) {
  const [page, setPage] = useState(1);
  const list = useFacilityUnavailableList(facility.id, page);

  const rules = facility.category;
  const startTimes = slotTimes(rules.slotMinutes);
  const endTimes = slotTimes(rules.slotMinutes, true);
  const today = kstToday();
  const [startDate, setStartDate] = useState(today);
  const [startMinute, setStartMinute] = useState(rules.openMinute);
  const [endDate, setEndDate] = useState(today);
  const [endMinute, setEndMinute] = useState(rules.closeMinute);
  const [reason, setReason] = useState("");
  const startAt = startDate ? kstIso(startDate, startMinute) : "";
  const endAt = endDate ? kstIso(endDate, endMinute) : "";
  const [formError, setFormError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<UnavailableConflict[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FacilityUnavailable | null>(null);

  const create = useAdminFacilityMutation(() =>
    createFacilityUnavailable(facility.id, { startAt, endAt, reason: reason.trim() || null }),
  );
  const remove = useAdminFacilityMutation((id: number) => deleteFacilityUnavailable(facility.id, id));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!startDate || !endDate) return setFormError("시작일과 종료일을 입력해 주세요.");
    if (Date.parse(endAt) <= Date.parse(startAt)) return setFormError("종료는 시작보다 뒤여야 합니다.");
    if (reason.trim().length > 200) return setFormError("사유는 200자 이하로 입력해 주세요.");
    setFormError(null);

    create.mutate(undefined, {
      onSuccess: (result) => {
        setConflicts(result.conflicts);
        toast.success(result.conflicts.length > 0 ? `등록했습니다. 겹치는 예약 ${result.conflicts.length}건을 확인하세요.` : "사용 불가 기간을 등록했습니다.");
        setReason("");
        setPage(1);
      },
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success("사용 불가 기간을 삭제했습니다.");
        setDeleteTarget(null);
      },
      onError: (error) => {
        toast.error(getErrorMessage(error));
        setDeleteTarget(null);
      },
    });
  };

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>사용 불가 기간 · {facility.name}</DialogTitle>
        <DialogDescription>점검 등으로 예약을 받지 않는 기간입니다. 여러 날에 걸쳐도 됩니다.</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border p-4" noValidate>
        <FormError message={formError ?? (create.error ? getErrorMessage(create.error) : null)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <DateTimeField
            id="unavailable-start"
            label="시작"
            date={startDate}
            minute={startMinute}
            times={startTimes}
            onDateChange={(d) => {
              setStartDate(d);
              if (endDate < d) setEndDate(d);
            }}
            onMinuteChange={setStartMinute}
          />
          <DateTimeField
            id="unavailable-end"
            label="종료"
            date={endDate}
            minDate={startDate}
            minute={endMinute}
            times={endTimes}
            onDateChange={setEndDate}
            onMinuteChange={setEndMinute}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          시각은 {rules.slotMinutes}분 단위로 고릅니다. 하루 전체는 00:00 ~ 24:00
        </p>
        <FormField id="unavailable-reason" label="사유">
          <Input id="unavailable-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 정기 점검" autoComplete="off" />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
            등록
          </Button>
        </div>
      </form>

      {/* 방금 등록한 기간과 겹치는 기존 예약 (경고만, 예약은 그대로) */}
      {conflicts && conflicts.length > 0 && (
        <div role="alert" className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            겹치는 예약 {conflicts.length}건이 그대로 남아 있습니다
          </p>
          <p className="text-muted-foreground">예약자에게 알림은 가지 않습니다. 필요하면 예약 관리에서 취소하거나 예약자에게 직접 알려 주세요.</p>
          <ul className="divide-y rounded-md border bg-background">
            {conflicts.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span className="tabular-nums">
                  {formatDateTime(c.startAt)} ~ {formatDateTime(c.endAt).slice(11)}
                </span>
                <span className="text-muted-foreground">
                  {c.title || "예약"} · {c.user.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">등록된 기간</h3>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.data.length === 0 ? (
          <EmptyState message="등록된 사용 불가 기간이 없습니다." />
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {list.data.data.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="tabular-nums">
                      {formatDateTime(u.startAt)} ~ {formatDateTime(u.endAt)}
                    </div>
                    {u.reason && <div className="truncate text-xs text-muted-foreground">{u.reason}</div>}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="사용 불가 기간 삭제" onClick={() => setDeleteTarget(u)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <PaginationBar meta={list.data.meta} onPageChange={setPage} />
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="사용 불가 기간 삭제"
        description="삭제하면 그 기간에 다시 예약할 수 있습니다."
        confirmLabel="삭제"
        destructive
        pending={remove.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// 날짜 + 시각(칸 경계) 입력 한 쌍
function DateTimeField({
  id,
  label,
  date,
  minDate,
  minute,
  times,
  onDateChange,
  onMinuteChange,
}: {
  id: string;
  label: string;
  date: string;
  minDate?: string;
  minute: number;
  times: number[];
  onDateChange: (date: string) => void;
  onMinuteChange: (minute: number) => void;
}) {
  return (
    <FormField id={`${id}-date`} label={label} required>
      <div className="flex gap-2">
        <Input id={`${id}-date`} type="date" value={date} min={minDate} onChange={(e) => onDateChange(e.target.value)} className="min-w-0 flex-1" />
        <Select value={String(minute)} onValueChange={(v) => onMinuteChange(Number(v))}>
          <SelectTrigger id={`${id}-time`} aria-label={`${label} 시각`} className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {times.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {formatHm(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormField>
  );
}
