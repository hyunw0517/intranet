"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/error-message";
import { useAuth } from "@/providers/auth-provider";
import { cancelReservation, deleteReservation } from "@/services/api/reservations";
import { RESERVATION_STATUS_LABEL, type Reservation } from "@/types/reservation";
import { useReservation, useReservationMutation } from "../hooks/use-reservations";
import { reservationActions } from "../reservation-permission";
import { formatReservationRange } from "../reservation-time";

interface ReservationDetailDialogProps {
  reservationId: number | null;
  onClose: () => void;
  onEdit: (reservation: Reservation) => void;
}

// 시간표에서 예약을 눌렀을 때: 상세 + (권한이 있으면) 수정·취소·삭제
// 관리자가 남의 예약을 취소·삭제·시간 변경하면 서버가 예약자에게 알림을 보낸다.
export function ReservationDetailDialog({ reservationId, onClose, onEdit }: ReservationDetailDialogProps) {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useReservation(reservationId);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);

  const cancel = useReservationMutation(cancelReservation);
  const remove = useReservationMutation(deleteReservation);
  const running = cancel.isPending || remove.isPending;

  const run = async () => {
    if (!data || !confirm) return;
    try {
      if (confirm === "cancel") {
        await cancel.mutateAsync(data.id);
        toast.success("예약을 취소했습니다.");
      } else {
        await remove.mutateAsync(data.id);
        toast.success("예약을 삭제했습니다.");
      }
      setConfirm(null);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const actions = data ? reservationActions(data, user) : { canChange: false, canDelete: false };
  const othersReservation = data && user && data.userId !== user.id;

  return (
    <>
      <Dialog open={reservationId !== null} onOpenChange={(next) => !next && !running && onClose()}>
        <DialogContent className="sm:max-w-md">
          {isPending ? (
            <>
              <DialogTitle className="sr-only">예약 상세</DialogTitle>
              <LoadingState />
            </>
          ) : isError ? (
            <>
              <DialogTitle className="sr-only">예약 상세</DialogTitle>
              <ErrorState error={error} onRetry={() => refetch()} />
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {data.title || "예약"}
                  {data.status === "CANCELLED" && <Badge variant="secondary">{RESERVATION_STATUS_LABEL[data.status]}</Badge>}
                </DialogTitle>
                <DialogDescription>{data.facility.category.name} · {data.facility.name}</DialogDescription>
              </DialogHeader>

              <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">시간</dt>
                <dd className="tabular-nums">{formatReservationRange(data.startAt, data.endAt)}</dd>
                <dt className="text-muted-foreground">예약자</dt>
                <dd>{data.user.name}</dd>
                {data.description && (
                  <>
                    <dt className="text-muted-foreground">설명</dt>
                    <dd className="whitespace-pre-wrap">{data.description}</dd>
                  </>
                )}
              </dl>

              {(actions.canChange || actions.canDelete) && (
                <DialogFooter className="gap-2 sm:justify-between">
                  {actions.canDelete ? (
                    <Button variant="ghost" className="text-destructive" onClick={() => setConfirm("delete")}>
                      삭제
                    </Button>
                  ) : (
                    <span />
                  )}
                  {actions.canChange && (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setConfirm("cancel")}>
                        예약 취소
                      </Button>
                      <Button onClick={() => onEdit(data)}>수정</Button>
                    </div>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm === "delete" ? "예약을 삭제할까요?" : "예약을 취소할까요?"}
        description={
          <>
            {confirm === "delete"
              ? "삭제한 예약은 목록에서 사라집니다."
              : "취소한 예약은 내 예약에 '취소됨'으로 남고, 그 시간은 다른 사람이 예약할 수 있습니다."}
            {othersReservation && " 예약자에게 알림이 갑니다."}
          </>
        }
        confirmLabel={confirm === "delete" ? "삭제" : "예약 취소"}
        destructive={confirm === "delete"}
        pending={running}
        onConfirm={run}
      />
    </>
  );
}
