"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/data-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Approver } from "@/types/approval";
import { useApproverSearch } from "../hooks/use-approvals";

interface ApproverPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  excludeIds?: number[]; // 이미 고른 결재자·기안자 (선택 불가로 표시)
  onPick: (approver: Approver) => void;
}

// 회원 이름·소속 한 줄 (결재자 목록·검색 결과 공용)
export function approverMeta(a: Pick<Approver, "departmentName" | "positionName" | "jobTitleName">) {
  return [a.departmentName, a.positionName, a.jobTitleName].filter(Boolean).join(" · ") || "소속 없음";
}

// 결재자 검색 창 (공용 회원 검색, 최대 20명)
// 입력이 멈추고 0.3초 뒤에 검색하고, 검색어가 없으면 목록을 보여 주지 않는다.
export function ApproverPickerDialog({
  open,
  onOpenChange,
  title = "결재자 추가",
  description = "이름·사번·부서명으로 찾습니다. 재직 중인 직원만 지정할 수 있습니다.",
  excludeIds = [],
  onPick,
}: ApproverPickerDialogProps) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isPending, isError, error, refetch, isFetching } = useApproverSearch(search, open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setInput("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="이름, 사번, 부서"
            aria-label="결재자 검색"
            className="h-9 pl-8"
            autoFocus
          />
          {isFetching && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>

        {/* 결과 수에 따라 창 크기가 바뀌지 않도록 높이를 고정한다 */}
        <div className="h-80 overflow-y-auto">
          {search === "" || isPending ? null : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : data.length === 0 ? (
            <EmptyState message="검색 결과가 없습니다." />
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.map((a) => {
                const excluded = excludeIds.includes(a.id);
                return (
                  <li key={a.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={excluded}
                      className="h-auto w-full justify-start gap-3 rounded-none px-3 py-2 text-left"
                      onClick={() => {
                        onPick(a);
                        onOpenChange(false);
                        setInput("");
                      }}
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">
                          {a.name} <span className="font-normal text-muted-foreground tabular-nums">{a.empNo}</span>
                        </span>
                        <span className="truncate text-xs font-normal text-muted-foreground">{approverMeta(a)}</span>
                      </span>
                      {excluded && <span className="shrink-0 text-xs text-muted-foreground">지정됨</span>}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
