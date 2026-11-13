"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { cancelReservation, cancelReservations, deleteReservation, type ReservationListQuery } from "@/services/api/reservations";
import { RESERVATION_STATUS_LABEL, type Reservation } from "@/types/reservation";
import { useFacilityCategories, useMyReservations, useReservationMutation } from "../hooks/use-reservations";
import { reservationActions } from "../reservation-permission";
import { formatReservationRange } from "../reservation-time";
import { ReservationFormDialog, type ReservationFormState } from "./reservation-form-dialog";

type Tab = "upcoming" | "past" | "cancelled";

type Pending = { kind: "cancel" | "delete"; ids: number[] } | null;

// 내 예약 (알림의 이동 주소 /reservations/me)
// - 예정: 아직 시작하지 않은 예약 (가까운 순) - 여러 건을 골라 한 번에 취소할 수 있다. (반복 예약 정리용)
// - 지난: 시작한 예약 (최근 순) - 본인은 수정·취소·삭제할 수 없다.
// - 취소: 취소한 예약 (기록) - 시작 전이면 삭제(목록에서 숨김)만 가능
export function MyReservationsView() {
  const { user } = useAuth();
  // "지금"은 화면을 열 때 한 번만 정한다. (렌더마다 바뀌면 queryKey가 바뀌어 계속 다시 조회된다)
  const [now] = useState(() => new Date().toISOString());
  const [tab, setTab] = useState<Tab>("upcoming");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [form, setForm] = useState<ReservationFormState>(null);

  const query: ReservationListQuery =
    tab === "upcoming"
      ? { status: "RESERVED", from: now, order: "asc", page, take: 20 }
      : tab === "past"
        ? { status: "RESERVED", to: now, order: "desc", page, take: 20 }
        : { status: "CANCELLED", order: "desc", page, take: 20 };
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMyReservations(query);
  const categories = useFacilityCategories();

  const cancelOne = useReservationMutation(cancelReservation);
  const cancelMany = useReservationMutation(cancelReservations);
  const remove = useReservationMutation(deleteReservation);
  const running = cancelOne.isPending || cancelMany.isPending || remove.isPending;

  const changeTab = (next: Tab) => {
    setTab(next);
    setPage(1);
    setSelected([]);
  };

  const rows = data?.data ?? [];
  const selectable = rows.filter((r) => tab === "upcoming" && reservationActions(r, user).canChange);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.includes(r.id));

  const toggle = (id: number) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openEdit = (reservation: Reservation) => {
    const category = categories.data?.find((c) => c.id === reservation.facility.category.id);
    if (!category) {
      toast.error("시설 분류 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    setForm({ mode: "edit", rules: category, reservation });
  };

  const run = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "delete") {
        await remove.mutateAsync(confirm.ids[0]);
        toast.success("예약을 삭제했습니다.");
      } else if (confirm.ids.length === 1) {
        await cancelOne.mutateAsync(confirm.ids[0]);
        toast.success("예약을 취소했습니다.");
      } else {
        await cancelMany.mutateAsync(confirm.ids);
        toast.success(`예약 ${confirm.ids.length}건을 취소했습니다.`);
      }
      setSelected((prev) => prev.filter((id) => !confirm.ids.includes(id)));
      setConfirm(null);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="upcoming">예정</TabsTrigger>
            <TabsTrigger value="past">지난 예약</TabsTrigger>
            <TabsTrigger value="cancelled">취소</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "upcoming" && selected.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "cancel", ids: selected })}>
            선택한 {selected.length}건 취소
          </Button>
        )}
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          message={tab === "upcoming" ? "예정된 예약이 없습니다." : tab === "past" ? "지난 예약이 없습니다." : "취소한 예약이 없습니다."}
        />
      ) : (
        <div className={cn("grid gap-3", isPlaceholderData && "opacity-60 transition-opacity")}>
          <ul className="divide-y rounded-lg border">
            {tab === "upcoming" && selectable.length > 0 && (
              <li className="flex items-center gap-3 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                <Checkbox
                  aria-label="이 페이지의 예약 모두 선택"
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelected(checked ? [...new Set([...selected, ...selectable.map((r) => r.id)])] : selected.filter((id) => !selectable.some((r) => r.id === id)))
                  }
                />
                이 페이지 모두 선택
              </li>
            )}
            {rows.map((r) => {
              const actions = reservationActions(r, user);
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                  {tab === "upcoming" && (
                    <Checkbox
                      className="mt-0.5"
                      aria-label={`${formatReservationRange(r.startAt, r.endAt)} 선택`}
                      checked={selected.includes(r.id)}
                      disabled={!actions.canChange}
                      onCheckedChange={() => toggle(r.id)}
                    />
                  )}
                  <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[16rem_1fr] sm:gap-4">
                    <span className="text-sm tabular-nums">{formatReservationRange(r.startAt, r.endAt)}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.title || "제목 없음"}</span>
                        {r.status === "CANCELLED" && <Badge variant="secondary">{RESERVATION_STATUS_LABEL[r.status]}</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.facility.category.name} · {r.facility.name}
                      </div>
                    </div>
                  </div>
                  {(actions.canChange || actions.canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="예약 관리">
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {actions.canChange && (
                          <>
                            <DropdownMenuItem onSelect={() => openEdit(r)}>수정</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "cancel", ids: [r.id] })}>예약 취소</DropdownMenuItem>
                          </>
                        )}
                        {actions.canDelete && (
                          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete", ids: [r.id] })}>
                            삭제
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
          {data && <PaginationBar meta={data.meta} onPageChange={setPage} />}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "delete" ? "예약을 삭제할까요?" : confirm && confirm.ids.length > 1 ? `예약 ${confirm.ids.length}건을 취소할까요?` : "예약을 취소할까요?"}
        description={
          confirm?.kind === "delete"
            ? "삭제한 예약은 목록에서 사라집니다."
            : "취소한 예약은 '취소' 탭에 남고, 그 시간은 다른 사람이 예약할 수 있습니다. 하나라도 취소할 수 없으면 아무것도 취소되지 않습니다."
        }
        confirmLabel={confirm?.kind === "delete" ? "삭제" : "예약 취소"}
        destructive={confirm?.kind === "delete"}
        pending={running}
        onConfirm={run}
      />
      <ReservationFormDialog state={form} onClose={() => setForm(null)} />
    </div>
  );
}
