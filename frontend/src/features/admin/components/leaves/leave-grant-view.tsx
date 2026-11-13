"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError, FormField } from "@/components/common/form-field";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDays, thisYearKst } from "@/features/leave/leave-rules";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { adjustLeaveGrant, recalculateLeaveGrants, type AdjustLeaveGrantInput } from "@/services/api/leave-grants";
import type { LeaveGrantRow } from "@/types/leave";
import { useAdminLeaveMutation, useLeaveGrants } from "../../hooks/use-admin-leaves";

const TAKE = 20;

// 연차 관리 (관리자, docs/design/leave_calculate_manual.md 4~5장)
// - 그 연도 부여 행이 있는 회원 목록: 계산값 · 조정값 · 부여 · 사용 · 결재 중 · 잔여 (잔여는 조정으로 음수 가능)
// - [지금 재계산]: 오늘 기준 올해(12월이면 다음 해도) 계산값을 다시 계산한다. 조정값은 유지
// - [조정]: 올해, 또는 12월에 만들어진 다음 해 행만. 지난 연도는 보기만 한다(연차수당 근거)
export function LeaveGrantView() {
  const thisYear = thisYearKst();
  const [year, setYear] = useState(thisYear);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<LeaveGrantRow | null>(null);

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useLeaveGrants({ year, search: search || undefined, page, take: TAKE });
  const recalc = useAdminLeaveMutation(recalculateLeaveGrants);
  const editable = year === thisYear || year === thisYear + 1;

  const moveYear = (delta: number) => {
    setYear((y) => y + delta);
    setPage(1);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="이전 연도" onClick={() => moveYear(-1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-16 text-center font-semibold tabular-nums" aria-live="polite">
              {year}년
            </span>
            <Button variant="outline" size="icon-sm" aria-label="다음 연도" onClick={() => moveYear(1)}>
              <ChevronRight />
            </Button>
          </div>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="이름·사번"
              aria-label="이름·사번 검색"
              className="h-8 w-40"
            />
            <Button type="submit" variant="outline" size="icon-sm" aria-label="검색">
              <Search />
            </Button>
          </form>
        </div>
        <Button variant="outline" onClick={() => setRecalcOpen(true)}>
          <RefreshCw aria-hidden />
          지금 재계산
        </Button>
      </div>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState
          message={
            search
              ? "검색 결과가 없습니다."
              : year > thisYear
                ? `${year}년 연차는 12월 재계산 때 만들어집니다.`
                : `${year}년 연차 부여 내역이 없습니다.`
          }
        />
      ) : (
        <>
          <div className={cn("overflow-x-auto rounded-lg border", isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회원</TableHead>
                  <TableHead className="w-28">입사일</TableHead>
                  <TableHead className="text-right">계산값</TableHead>
                  <TableHead className="text-right">영구 조정</TableHead>
                  <TableHead className="text-right">올해 조정</TableHead>
                  <TableHead className="text-right">부여</TableHead>
                  <TableHead className="text-right">사용</TableHead>
                  <TableHead className="text-right">결재 중</TableHead>
                  <TableHead className="text-right">잔여</TableHead>
                  {editable && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => (
                  <TableRow key={row.user.id}>
                    <TableCell>
                      <span className="font-medium">{row.user.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground tabular-nums">{row.user.empNo}</span>
                      {row.user.status !== "ACTIVE" && (
                        <span className="ml-2 text-xs text-muted-foreground">({row.user.status === "INACTIVE" ? "휴직" : "퇴사"})</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.user.joinAt ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDays(row.baseDays)}</TableCell>
                    <TableCell className="text-right tabular-nums" title={row.permanentSetting.reason ?? undefined}>
                      {signedDays(row.permanentDays)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" title={row.adjustReason ?? undefined}>
                      {signedDays(row.adjustDays)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatDays(row.grantedDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDays(row.usedDays)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDays(row.inProgressDays)}</TableCell>
                    <TableCell className={cn("text-right font-medium tabular-nums", row.remainingDays < 0 && "text-destructive")}>
                      {formatDays(row.remainingDays)}
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>
                          조정
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationBar meta={data.meta} onPageChange={setPage} />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        부여 = 계산값 + 영구 조정 + 올해 조정. 영구 조정은 매년 자동으로 더해지고(근속 인정 등, 입사한 해 제외), 올해 조정은 그 연도에만 적용됩니다(이월·포상·차감, 입사한 해의 월 단위 보정). 모두 0.25일 단위입니다.
      </p>

      <ConfirmDialog
        open={recalcOpen}
        onOpenChange={setRecalcOpen}
        title="연차를 지금 다시 계산할까요?"
        description="오늘 기준으로 올해(12월이면 다음 해도) 계산값을 다시 계산합니다. 관리자 조정값과 지난 연도 기록은 바뀌지 않습니다."
        confirmLabel="재계산"
        pending={recalc.isPending}
        onConfirm={() =>
          recalc.mutate(undefined, {
            onSuccess: (result) => {
              toast.success(`연차를 다시 계산했습니다. (${result.years.map((y) => `${y.year}년 ${y.count}명`).join(", ")})`);
              setRecalcOpen(false);
            },
            onError: (e) => {
              toast.error(getErrorMessage(e));
              setRecalcOpen(false);
            },
          })
        }
      />

      <AdjustDialog row={adjusting} year={year} onClose={() => setAdjusting(null)} />
    </div>
  );
}

// 조정값·사유 입력 (서버: 0.25 단위, 부여 합계 ≥ 0)
function AdjustDialog({ row, year, onClose }: { row: LeaveGrantRow | null; year: number; onClose: () => void }) {
  const mutation = useAdminLeaveMutation((v: { userId: number; input: Omit<AdjustLeaveGrantInput, "year"> }) =>
    adjustLeaveGrant(v.userId, { year, ...v.input }),
  );

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (open || mutation.isPending) return;
        mutation.reset(); // 지난 오류가 다음 회원 창에 남지 않게
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {row && (
          <AdjustForm
            key={row.user.id}
            row={row}
            year={year}
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={() => {
              mutation.reset();
              onClose();
            }}
            onSubmit={(input) =>
              mutation.mutate(
                { userId: row.user.id, input },
                {
                  onSuccess: () => {
                    toast.success(`${row.user.name}님의 ${year}년 연차를 조정했습니다.`);
                    mutation.reset();
                    onClose();
                  },
                },
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// 조정 창: 영구 조정값·사유 + 올해(그 연도) 조정값·사유 (2026-11-12 사용자 결정)
// - 영구: 매년 자동으로 더한다(근속 인정 등). 저장하면 올해부터 반영, 입사한 해와 지난 연도는 바뀌지 않는다.
// - 올해: 그 연도에만 (이월·포상·차감, 입사한 해의 월 단위 보정). 새해에는 0으로 시작
// - 0.25일 단위, 값이 0이 아니면 사유 필수, 부여 합계 ≥ 0 (25일 한도 없음)
function AdjustForm({
  row,
  year,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  row: LeaveGrantRow;
  year: number;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (input: Omit<AdjustLeaveGrantInput, "year">) => void;
}) {
  const [permanent, setPermanent] = useState(String(row.permanentSetting.days));
  const [permanentReason, setPermanentReason] = useState(row.permanentSetting.reason ?? "");
  const [adjust, setAdjust] = useState(String(row.adjustDays));
  const [adjustReason, setAdjustReason] = useState(row.adjustReason ?? "");
  const [errors, setErrors] = useState<Partial<Record<"permanent" | "permanentReason" | "adjust" | "adjustReason", string>>>({});

  // 고친 칸의 오류는 바로 지운다
  const clearError = (key: keyof typeof errors) => errors[key] && setErrors((prev) => ({ ...prev, [key]: undefined }));

  const p = Number(permanent);
  const a = Number(adjust);
  const valid = (v: number, raw: string) => raw.trim() !== "" && Number.isFinite(v) && Math.round(v * 4) === v * 4;
  // 입사한 해에는 영구 조정값이 적용되지 않는다 (서버와 같은 규칙)
  const joinYear = row.user.joinAt ? Number(row.user.joinAt.slice(0, 4)) : null;
  const appliesPermanent = joinYear !== year;
  const granted = row.baseDays + (appliesPermanent && valid(p, permanent) ? p : 0) + (valid(a, adjust) ? a : 0);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!valid(p, permanent)) next.permanent = "0.25일 단위 숫자로 입력하세요.";
    if (!valid(a, adjust)) next.adjust = "0.25일 단위 숫자로 입력하세요.";
    if (valid(p, permanent) && p !== 0 && !permanentReason.trim()) next.permanentReason = "영구 조정 사유를 입력하세요.";
    if (valid(a, adjust) && a !== 0 && !adjustReason.trim()) next.adjustReason = `${year}년 조정 사유를 입력하세요.`;
    if (!next.permanent && !next.adjust && granted < 0) next.adjust = "부여 합계가 0보다 작아질 수 없습니다.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      permanentDays: p,
      permanentReason: permanentReason.trim() || null,
      adjustDays: a,
      adjustReason: adjustReason.trim() || null,
    });
  };

  return (
    <form noValidate className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>
          {row.user.name} · {year}년 연차 조정
        </DialogTitle>
        <DialogDescription>
          부여 = 계산값 {formatDays(row.baseDays)} + 영구 조정 + {year}년 조정 = <span className="font-medium text-foreground">{Number.isFinite(granted) ? formatDays(granted) : "-"}</span>
        </DialogDescription>
      </DialogHeader>

      <FormError message={error ? getErrorMessage(error) : null} />

      <div className="grid gap-3 rounded-lg border p-3">
        <FormField
          id="permanent-days"
          label="영구 조정값 (일)"
          error={errors.permanent}
          hint={appliesPermanent ? "매년 자동으로 더합니다. 저장하면 올해부터 반영됩니다." : "입사한 해에는 적용되지 않습니다(다음 해부터). 월 단위 연차는 아래 조정값으로 맞추세요."}
        >
          <Input
            id="permanent-days"
            type="number"
            step={0.25}
            inputMode="decimal"
            value={permanent}
            onChange={(e) => { setPermanent(e.target.value); clearError("permanent"); }}
            aria-invalid={!!errors.permanent}
            aria-describedby="permanent-days-message"
          />
        </FormField>
        <FormField id="permanent-reason" label="영구 조정 사유" error={errors.permanentReason} hint="예: 계열사 근속 10년 인정">
          <Input
            id="permanent-reason"
            value={permanentReason}
            maxLength={200}
            onChange={(e) => { setPermanentReason(e.target.value); clearError("permanentReason"); }}
            aria-invalid={!!errors.permanentReason}
            aria-describedby="permanent-reason-message"
          />
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <FormField id="adjust-days" label={`매년 초기화되는 조정값 (${year}년, 일)`} error={errors.adjust} hint="이 연도에만 적용됩니다. 새해에는 0으로 시작합니다.">
          <Input
            id="adjust-days"
            type="number"
            step={0.25}
            inputMode="decimal"
            value={adjust}
            onChange={(e) => { setAdjust(e.target.value); clearError("adjust"); }}
            aria-invalid={!!errors.adjust}
            aria-describedby="adjust-days-message"
          />
        </FormField>
        <FormField id="adjust-reason" label={`${year}년 조정 사유`} error={errors.adjustReason} hint="예: 이월 3, 포상 1">
          <Input
            id="adjust-reason"
            value={adjustReason}
            maxLength={200}
            onChange={(e) => { setAdjustReason(e.target.value); clearError("adjustReason"); }}
            aria-invalid={!!errors.adjustReason}
            aria-describedby="adjust-reason-message"
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          저장
        </Button>
      </DialogFooter>
    </form>
  );
}

// 조정값 표시: 0이면 "-", 양수면 "+"
function signedDays(days: number) {
  return days === 0 ? "-" : `${days > 0 ? "+" : ""}${formatDays(days)}`;
}
