"use client";

import { useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 트리(부서·게시판)의 접힌 항목 id
// 화면 표시 상태일 뿐이라 서버 요청이 없다. (하위 목록은 처음 조회 때 전부 받아 둔 상태)
// 메모리에만 두므로 페이지를 다시 열면 전부 펼친 상태로 시작한다.
export function useCollapsedIds() {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  return {
    isCollapsed: (id: number) => collapsed.has(id),
    toggle: (id: number) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    // 접힌 상위에 하위를 추가·이동했을 때 새 항목이 보이도록 펼친다.
    expand: (id: number | null) =>
      setCollapsed((prev) => {
        if (id === null || !prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    collapseAll: (ids: number[]) => setCollapsed(new Set(ids)),
    expandAll: () => setCollapsed(new Set()),
    hasCollapsed: collapsed.size > 0,
  };
}

export type CollapsedIds = ReturnType<typeof useCollapsedIds>;

// 이름 왼쪽의 접기·펼치기 화살표
// 하위가 없는 항목은 같은 너비의 빈 칸을 두어 이름 위치를 맞춘다.
export function CollapseToggle({
  name,
  hasChildren,
  collapsed,
  onToggle,
}: {
  name: string;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (!hasChildren) return <span className="size-6 shrink-0" aria-hidden />;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${name} 하위 ${collapsed ? "펼치기" : "접기"}`}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} aria-hidden />
    </button>
  );
}

// 목록 위 [모두 펼치기] [모두 접기]
export function CollapseAllBar({
  collapse,
  parentIds,
}: {
  collapse: CollapsedIds;
  parentIds: number[]; // 하위가 있는 항목 id 전체
}) {
  if (parentIds.length === 0) return null;

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={collapse.expandAll} disabled={!collapse.hasCollapsed}>
        <ChevronsUpDown aria-hidden />
        모두 펼치기
      </Button>
      <Button variant="ghost" size="sm" onClick={() => collapse.collapseAll(parentIds)}>
        <ChevronsDownUp aria-hidden />
        모두 접기
      </Button>
    </div>
  );
}
