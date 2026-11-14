"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormError, FormField } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import { bulkChangeReservationTime, cancelReservations, deleteReservations } from "@/services/api/reservations";
import type { FacilityCategory, Reservation } from "@/types/reservation";
import { reservationActions } from "@/features/reservation/reservation-permission";
import { endOptions, formatHm, startOptions } from "@/features/reservation/reservation-time";
import { useAdminFacilityMutation } from "../../hooks/use-admin-facilities";

type BulkDialog = "time" | "cancel" | "delete" | null;

interface Props {
  selected: Reservation[];
  categories: FacilityCategory[];
  onDone: () => void; // 성공 후 선택 해제
}

// 예약 목록 하단의 선택 예약 일괄 처리 [시간 변경] [예약 취소] [삭제] (회원 관리 일괄 처리와 같은 배치)
// - 시간 변경·취소는 선택한 예약이 모두 "예약됨 + 시작 전"일 때만 누를 수 있다. 삭제는 관리자라 언제나.
// - 한 건이라도 처리할 수 없으면 서버가 전체를 거부하고(트랜잭션) 그 메시지를 보여 준다.
export function AdminReservationBulkActions({ selected, categories, onDone }: Props) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const count = selected.length;
  const ids = selected.map((r) => r.id);
  const canChangeAll = count > 0 && selected.every((r) => reservationActions(r, user).canChange);
  const othersCount = new Set(selected.filter((r) => r.userId !== user?.id).map((r) => r.userId)).size;
  const notice = othersCount > 0 ? ` 예약자 ${othersCount}명에게 알림이 갑니다.` : "";
  const close = () => setDialog(null);

  const cancel = useAdminFacilityMutation(cancelReservations);
  const remove = useAdminFacilityMutation(deleteReservations);

  const runConfirm = () => {
    const isDelete = dialog === "delete";
    (isDelete ? remove : cancel).mutate(ids, {
      onSuccess: () => {
        toast.success(isDelete ? `예약 ${count}건을 삭제했습니다.` : `예약 ${count}건을 취소했습니다.`);
        close();
        onDone();
      },
      onError: (e) => {
        toast.error(getErrorMessage(e));
        close();
      },
    });
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {count}건 선택
        </span>
        <Button variant="outline" size="sm" disabled={!canChangeAll} onClick={() => setDialog("time")}>
          시간 변경
        </Button>
        <Button variant="outline" size="sm" disabled={!canChangeAll} onClick={() => setDialog("cancel")}>
          예약 취소
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={count === 0}
          onClick={() => setDialog("delete")}
        >
          삭제
        </Button>
      </div>
      {count > 0 && !canChangeAll && (
        <p className="text-xs text-muted-foreground">취소됐거나 이미 시작한 예약이 포함되어 있어 시간 변경·취소는 할 수 없습니다. (삭제만 가능)</p>
      )}

      <ConfirmDialog
        open={dialog === "cancel" || dialog === "delete"}
        onOpenChange={(o) => !o && close()}
        title={dialog === "delete" ? `예약 ${count}건을 삭제할까요?` : `예약 ${count}건을 취소할까요?`}
        description={`한 건이라도 처리할 수 없으면 전체가 처리되지 않습니다.${notice}`}
        confirmLabel={dialog === "delete" ? "삭제" : "예약 취소"}
        destructive={dialog === "delete"}
        pending={cancel.isPending || remove.isPending}
        onConfirm={runConfirm}
      />
      <BulkTimeDialog
        open={dialog === "time"}
        onClose={close}
        ids={ids}
        rules={categoriesOf(selected, categories)}
        notice={notice}
        onDone={onDone}
      />
    </div>
  );
}

// 선택한 예약들의 분류 규칙 (시간 선택지를 만들 때 씀, 분류 정보를 못 불러왔으면 null)
function categoriesOf(selected: Reservation[], categories: FacilityCategory[]) {
  const ids = [...new Set(selected.map((r) => r.facility.category.id))];
  const found = ids.map((id) => categories.find((c) => c.id === id));
  return found.every((c) => c !== undefined) ? (found as FacilityCategory[]) : null;
}

// 모든 분류에서 고를 수 있는 시각만 남긴다. (분류마다 운영 시간·예약 단위가 다를 수 있음)
function intersect(lists: number[][]) {
  return lists.length === 0 ? [] : lists[0].filter((m) => lists.every((l) => l.includes(m)));
}

// 날짜는 예약마다 그대로 두고 시작·종료 시각을 같은 시간대로 맞춘다. (2026-11-14 사용자 결정)
function BulkTimeDialog({
  open,
  onClose,
  ids,
  rules,
  notice,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: number[];
  rules: FacilityCategory[] | null;
  notice: string;
  onDone: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const mutation = useAdminFacilityMutation(bulkChangeReservationTime);

  const starts = rules ? intersect(rules.map((r) => startOptions(r))) : [];
  const ends = rules && start ? intersect(rules.map((r) => endOptions(r, Number(start)))) : [];

  // 요청 중에는 닫지 않고, 닫을 때 입력값·이전 오류를 지운다.
  const handleOpenChange = (next: boolean) => {
    if (next || mutation.isPending) return;
    setStart("");
    setEnd("");
    mutation.reset();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!start || !end) return;
    const startTime = formatHm(Number(start));
    const endTime = formatHm(Number(end));
    mutation.mutate(
      { ids, startTime, endTime },
      {
        onSuccess: () => {
          toast.success(`예약 ${ids.length}건의 시간을 ${startTime}~${endTime}(으)로 변경했습니다.`);
          handleOpenChange(false);
          onDone();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>예약 {ids.length}건 시간 변경</DialogTitle>
          <DialogDescription>
            날짜는 예약마다 그대로 두고 시작·종료 시각을 모두 같은 시간으로 바꿉니다. 한 건이라도 바꿀 수 없으면 전체가 처리되지 않습니다.{notice}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          {/* 운영 시간 밖·지난 시각·겹침·같은 시설 같은 날짜 등 서버 검증 오류 */}
          <FormError message={mutation.error ? getErrorMessage(mutation.error) : null} />
          {rules === null ? (
            <FormError message="시설 분류 정보를 불러오지 못했습니다." />
          ) : starts.length === 0 ? (
            <FormError message="선택한 예약들의 분류 규칙(운영 시간·예약 단위)이 달라 함께 고를 수 있는 시간이 없습니다." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="bulk-start" label="시작" required>
                <Select
                  value={start}
                  onValueChange={(v) => {
                    setStart(v);
                    // 시작을 바꿔 종료가 선택지 밖이 되면 비운다.
                    if (end && rules && !intersect(rules.map((r) => endOptions(r, Number(v)))).includes(Number(end))) setEnd("");
                  }}
                >
                  <SelectTrigger id="bulk-start" className="w-full">
                    <SelectValue placeholder="시작 시각" />
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
              <FormField id="bulk-end" label="종료" required>
                <Select value={end} onValueChange={setEnd} disabled={!start}>
                  <SelectTrigger id="bulk-end" className="w-full">
                    <SelectValue placeholder="종료 시각" />
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
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
              취소
            </Button>
            <Button type="submit" disabled={!start || !end || mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
              변경
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
