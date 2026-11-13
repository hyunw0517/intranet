"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormField } from "@/components/common/form-field";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { cancelReservation, deleteReservation } from "@/services/api/reservations";
import { RESERVATION_STATUS_LABEL, type Reservation, type ReservationStatus } from "@/types/reservation";
import { ReservationFormDialog, type ReservationFormState } from "@/features/reservation/components/reservation-form-dialog";
import { reservationActions } from "@/features/reservation/reservation-permission";
import { addDays, formatReservationRange, kstIso } from "@/features/reservation/reservation-time";
import {
  useAdminFacilityCategories,
  useAdminFacilityMutation,
  useAdminReservations,
  useAllAdminFacilities,
} from "../../hooks/use-admin-facilities";

const ALL = "all";

// 전체 예약 관리 (관리자)
// - 시설·상태·기간(시작 날짜)으로 거른다. 기본은 최신 시작 순
// - 관리자: 시작 전이면 시간 변경·취소·삭제, 시작 후에는 삭제만. 남의 예약이면 서버가 예약자에게 알림을 보낸다.
export function AdminReservationList() {
  const { user } = useAuth();
  const [facilityId, setFacilityId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ kind: "cancel" | "delete"; reservation: Reservation } | null>(null);
  const [form, setForm] = useState<ReservationFormState>(null);

  const facilities = useAllAdminFacilities();
  const categories = useAdminFacilityCategories();
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useAdminReservations({
    page,
    take: 20,
    order: "desc",
    facilityId: facilityId === ALL ? undefined : Number(facilityId),
    status: status === ALL ? undefined : (status as ReservationStatus),
    from: fromDate ? kstIso(fromDate, 0) : undefined,
    to: toDate ? kstIso(addDays(toDate, 1), 0) : undefined, // 종료 날짜 포함
  });

  const cancel = useAdminFacilityMutation(cancelReservation);
  const remove = useAdminFacilityMutation(deleteReservation);

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const openEdit = (r: Reservation) => {
    const category = categories.data?.find((c) => c.id === r.facility.category.id);
    if (!category) return toast.error("시설 분류 정보를 불러오지 못했습니다.");
    setForm({ mode: "edit", rules: category, reservation: r });
  };

  const run = () => {
    if (!confirm) return;
    const mutation = confirm.kind === "cancel" ? cancel : remove;
    mutation.mutate(confirm.reservation.id, {
      onSuccess: () => {
        toast.success(confirm.kind === "cancel" ? "예약을 취소했습니다." : "예약을 삭제했습니다.");
        setConfirm(null);
      },
      onError: (e) => {
        toast.error(getErrorMessage(e));
        setConfirm(null);
      },
    });
  };

  const others = confirm && user && confirm.reservation.userId !== user.id;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField id="filter-facility" label="시설">
          <Select value={facilityId} onValueChange={resetPage(setFacilityId)}>
            <SelectTrigger id="filter-facility" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {(facilities.data ?? []).map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.category.name} · {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="filter-status" label="상태">
          <Select value={status} onValueChange={resetPage(setStatus)}>
            <SelectTrigger id="filter-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              <SelectItem value="RESERVED">예약됨</SelectItem>
              <SelectItem value="CANCELLED">취소됨</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="filter-from" label="시작 날짜부터">
          <Input id="filter-from" type="date" value={fromDate} onChange={(e) => resetPage(setFromDate)(e.target.value)} />
        </FormField>
        <FormField id="filter-to" label="시작 날짜까지">
          <Input id="filter-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => resetPage(setToDate)(e.target.value)} />
        </FormField>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState message="조건에 맞는 예약이 없습니다." />
      ) : (
        <div className={cn("grid gap-3", isPlaceholderData && "opacity-60 transition-opacity")}>
          {/* 넓은 화면은 표, 좁은 화면은 가로 스크롤 */}
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>시간</TableHead>
                  <TableHead>시설</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead>예약자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">관리</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => {
                  const actions = reservationActions(r, user);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{formatReservationRange(r.startAt, r.endAt)}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{r.facility.category.name} · </span>
                        {r.facility.name}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{r.title || "-"}</TableCell>
                      <TableCell>{r.user.name}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "RESERVED" ? "outline" : "secondary"}>{RESERVATION_STATUS_LABEL[r.status]}</Badge>
                      </TableCell>
                      <TableCell>
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
                                  <DropdownMenuItem onSelect={() => openEdit(r)}>시간 변경</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setConfirm({ kind: "cancel", reservation: r })}>예약 취소</DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "delete", reservation: r })}>
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <PaginationBar meta={data.meta} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "delete" ? "예약을 삭제할까요?" : "예약을 취소할까요?"}
        description={
          <>
            {confirm && `${confirm.reservation.facility.name} ${formatReservationRange(confirm.reservation.startAt, confirm.reservation.endAt)}`}
            {others && " · 예약자에게 알림이 갑니다."}
          </>
        }
        confirmLabel={confirm?.kind === "delete" ? "삭제" : "예약 취소"}
        destructive={confirm?.kind === "delete"}
        pending={cancel.isPending || remove.isPending}
        onConfirm={run}
      />
      <ReservationFormDialog state={form} onClose={() => setForm(null)} />
    </div>
  );
}
