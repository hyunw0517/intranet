"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEnabledAddons } from "@/features/addon/hooks/use-addons";
import { useAuditLogs } from "@/features/dashboard/hooks/use-dashboard";
import { formatDateTime } from "@/lib/format";
import type { AuditLogQuery } from "@/services/api/audit-logs";
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  AUDIT_TARGETS,
  type AuditActionType,
  type AuditLog,
  type AuditTargetType,
} from "@/types/audit";

const PAGE_SIZE = 30;
const ALL = "ALL";

const targetLabel = (log: AuditLog) => {
  if (!log.targetType) return "-";
  const label = AUDIT_TARGETS[log.targetType].label;
  return log.targetId === null ? label : `${label} #${log.targetId}`;
};

// 감사 로그 전체 조회: 기간·행동·대상·작업자 필터 + 행을 누르면 변경 내용
export function AuditLogView() {
  const [query, setQuery] = useState<AuditLogQuery>({ take: PAGE_SIZE });
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const { data, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useAuditLogs(query);
  const logs = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="grid gap-4">
      <AuditFilters onSearch={(filters) => setQuery({ ...filters, take: PAGE_SIZE })} />

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : logs.length === 0 ? (
        <EmptyState message="조건에 맞는 감사 로그가 없습니다." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table className="min-w-[56rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">시각</TableHead>
                  <TableHead className="w-32">작업자</TableHead>
                  <TableHead className="w-32">행동</TableHead>
                  <TableHead className="w-40">대상</TableHead>
                  <TableHead>내용</TableHead>
                  <TableHead className="w-20 text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.actor?.name ?? "-"}</TableCell>
                    <TableCell>{AUDIT_ACTION_LABEL[log.actionType]}</TableCell>
                    <TableCell>{targetLabel(log)}</TableCell>
                    <TableCell className="max-w-80 truncate">{log.content ?? "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(log)}>
                        보기
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {hasNextPage && (
            <Button variant="outline" className="justify-self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {isFetchingNextPage ? "불러오는 중" : "더 보기"}
            </Button>
          )}
        </>
      )}

      <AuditDetailDialog log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AuditFilters({ onSearch }: { onSearch: (filters: AuditLogQuery) => void }) {
  const { data: addons } = useEnabledAddons();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionType, setActionType] = useState<string>(ALL);
  const [targetType, setTargetType] = useState<string>(ALL);
  const [actor, setActor] = useState("");

  // 꺼진 애드온의 대상은 고를 수 없다.
  const targets = AUDIT_TARGET_TYPES.filter((type) => {
    const target = AUDIT_TARGETS[type];
    return !("addon" in target) || (addons?.enabled ?? []).includes(target.addon);
  });
  const invalidRange = !!from && !!to && from > to;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (invalidRange) return;
    onSearch({
      from: from || undefined,
      to: to || undefined,
      actionType: actionType === ALL ? undefined : (actionType as AuditActionType),
      targetType: targetType === ALL ? undefined : (targetType as AuditTargetType),
      actor: actor.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="audit-from">시작일</Label>
        <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-to">종료일</Label>
        <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={invalidRange} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-action">행동</Label>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger id="audit-action" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {AUDIT_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {AUDIT_ACTION_LABEL[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-target">대상</Label>
        <Select value={targetType} onValueChange={setTargetType}>
          <SelectTrigger id="audit-target" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {targets.map((target) => (
              <SelectItem key={target} value={target}>
                {AUDIT_TARGETS[target].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="audit-actor">작업자</Label>
        <Input id="audit-actor" value={actor} maxLength={50} placeholder="이름 또는 사번" onChange={(e) => setActor(e.target.value)} />
      </div>
      <Button type="submit" disabled={invalidRange}>
        조회
      </Button>
      {invalidRange && <p className="text-sm text-destructive sm:col-span-2 lg:col-span-6">시작일은 종료일보다 늦을 수 없습니다.</p>}
    </form>
  );
}

function AuditDetailDialog({ log, onClose }: { log: AuditLog | null; onClose: () => void }) {
  return (
    <Dialog open={log !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>감사 로그 상세</DialogTitle>
        </DialogHeader>
        {log && (
          <dl className="grid min-w-0 gap-3 text-sm">
            <DetailRow label="시각" value={formatDateTime(log.createdAt)} />
            <DetailRow label="작업자" value={log.actor ? `${log.actor.name} (${log.actor.empNo})` : "-"} />
            <DetailRow label="행동" value={AUDIT_ACTION_LABEL[log.actionType]} />
            <DetailRow label="대상" value={targetLabel(log)} />
            <DetailRow label="내용" value={log.content ?? "-"} />
            <DetailRow label="IP" value={log.ipAddress ?? "-"} />
            <DetailRow label="접속 환경" value={log.userAgent ?? "-"} />
            <div className="grid min-w-0 gap-1">
              <dt className="text-muted-foreground">변경 내용</dt>
              <dd className="min-w-0">
                {log.detail === null ? (
                  "-"
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(log.detail, null, 2)}</pre>
                )}
              </dd>
            </div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[6rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
