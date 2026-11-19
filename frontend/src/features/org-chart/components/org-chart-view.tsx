"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Network } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DirectoryUser, OrgChartDepartment } from "@/services/api/org-chart";
import { useDepartmentMembers, useOrgChart } from "../hooks/use-org-chart";
import { DirectoryUserDialog } from "./directory-user-dialog";

// 조직도 - 왼쪽 부서 트리(접고 펼치기), 오른쪽 선택한 부서의 구성원
// - 구성원은 그 부서에 직접 소속된 사람만(하위 부서 제외), 겸직자 포함 (2026-11-19 사용자 결정)
// - 모바일·태블릿(lg 미만)은 트리를 [부서 선택] 버튼으로 접어 두고, 부서를 고르면 다시 접는다
export function OrgChartView() {
  const chart = useOrgChart();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const departments = useMemo(() => chart.data ?? [], [chart.data]);

  // 고르기 전에는 첫 부서를 보여 준다
  const currentId = selectedId ?? departments[0]?.id ?? null;
  const current = departments.find((d) => d.id === currentId) ?? null;

  if (chart.isPending) return <LoadingState />;
  if (chart.isError) return <ErrorState error={chart.error} onRetry={() => chart.refetch()} />;
  if (departments.length === 0) return <EmptyState message="등록된 부서가 없습니다." />;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:items-start">
      <div className="rounded-lg border">
        <Button
          variant="ghost"
          className="w-full justify-between rounded-b-none lg:hidden"
          onClick={() => setTreeOpen((v) => !v)}
          aria-expanded={treeOpen}
          aria-controls="org-tree"
        >
          <span className="flex items-center gap-2">
            <Network aria-hidden />
            {current ? current.name : "부서 선택"}
          </span>
          <ChevronDown className={cn("transition-transform", treeOpen && "rotate-180")} aria-hidden />
        </Button>
        <div id="org-tree" className={cn("border-t p-2 lg:block lg:border-t-0", !treeOpen && "hidden")}>
          <DepartmentTree
            departments={departments}
            selectedId={currentId}
            onSelect={(id) => {
              setSelectedId(id);
              setTreeOpen(false);
            }}
          />
        </div>
      </div>

      {current && <DepartmentMembers department={current} />}
    </div>
  );
}

// 트리: 서버가 트리 순서(상위 → 하위)의 평평한 목록 + depth를 주므로 들여쓰기로 그린다.
// 다음 항목의 depth가 더 크면 하위 부서가 있는 것이다. 접은 부서의 하위 항목은 건너뛴다.
function DepartmentTree({
  departments,
  selectedId,
  onSelect,
}: {
  departments: OrgChartDepartment[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: React.ReactNode[] = [];
  let hideDeeperThan: number | null = null; // 접힌 부서의 depth (그보다 깊은 항목은 숨김)

  departments.forEach((d, i) => {
    if (hideDeeperThan !== null) {
      if (d.depth > hideDeeperThan) return;
      hideDeeperThan = null;
    }

    const hasChildren = (departments[i + 1]?.depth ?? -1) > d.depth;
    const isCollapsed = collapsed.has(d.id);
    if (hasChildren && isCollapsed) hideDeeperThan = d.depth;

    rows.push(
      <li key={d.id} className="flex items-center" style={{ paddingLeft: `${d.depth * 1}rem` }}>
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={() => toggle(d.id)}
            aria-label={`${d.name} ${isCollapsed ? "펼치기" : "접기"}`}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(d.id)}
          aria-current={d.id === selectedId ? "true" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            d.id === selectedId && "bg-muted font-medium",
          )}
        >
          <span className="truncate">{d.name}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{d.memberCount}</span>
        </button>
      </li>,
    );
  });

  return <ul className="grid gap-0.5">{rows}</ul>;
}

function DepartmentMembers({ department }: { department: OrgChartDepartment }) {
  const members = useDepartmentMembers(department.id);
  const [detail, setDetail] = useState<DirectoryUser | null>(null);

  return (
    <section aria-labelledby="org-members-title" className="grid gap-3">
      <h2 id="org-members-title" className="flex items-baseline gap-2 text-base font-semibold">
        {department.name}
        <span className="text-sm font-normal text-muted-foreground">{department.memberCount}명</span>
      </h2>

      {members.isPending ? (
        <LoadingState />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : members.data.length === 0 ? (
        <EmptyState message="이 부서에 직접 소속된 구성원이 없습니다." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {members.data.map((m) => {
            const here = m.departments.find((d) => d.departmentId === department.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setDetail(m)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserAvatar name={m.name} imageUrl={m.profileImageUrl} className="size-10" fallbackClassName="text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{m.name}</span>
                      {m.positionName && <span className="shrink-0 text-sm text-muted-foreground">{m.positionName}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {here?.jobTitleName && <span>{here.jobTitleName}</span>}
                      {here && !here.isPrimary && <Badge variant="outline">겸직</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <DirectoryUserDialog user={detail} onClose={() => setDetail(null)} />
    </section>
  );
}
