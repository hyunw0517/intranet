"use client";

import { useState } from "react";
import { Check, EyeOff, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-state";
import { FormError } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { createBudgetCategory, deleteBudgetCategory, updateBudgetCategory } from "@/services/api/project-budgets";
import type { BudgetCategory } from "@/types/project";
import { useBudgetCategories, useProjectMutation, useProjectStats, useProjectStatsFilters } from "../hooks/use-projects";
import { BudgetCompareChart, MonthlyAmountChart, TopClientsChart } from "./charts-lazy";
import { DeletedProjectsView } from "./deleted-projects-view";

// 관리자 - 프로젝트 관리: 전사 통계 / 비용 항목 / 삭제된 프로젝트
export function AdminProjectsView() {
  return (
    <Tabs defaultValue="stats">
      <TabsList>
        <TabsTrigger value="stats">통계</TabsTrigger>
        <TabsTrigger value="categories">비용 항목</TabsTrigger>
        <TabsTrigger value="deleted">삭제된 프로젝트</TabsTrigger>
      </TabsList>
      <TabsContent value="stats" className="mt-4">
        <CompanyStats />
      </TabsContent>
      <TabsContent value="categories" className="mt-4">
        <BudgetCategories />
      </TabsContent>
      <TabsContent value="deleted" className="mt-4">
        <DeletedProjectsView />
      </TabsContent>
    </Tabs>
  );
}

const ALL = "all";
const RECENT = "recent";

// 전사 통계 - 기본은 최근 12개월·전체. 지난 연도, 프로젝트, 거래처로 좁혀 볼 수 있다 (삭제된 프로젝트 제외)
function CompanyStats() {
  const [year, setYear] = useState(RECENT);
  const [clientId, setClientId] = useState(ALL);
  const [projectId, setProjectId] = useState(ALL);

  const filters = useProjectStatsFilters();
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useProjectStats({
    year: year === RECENT ? undefined : Number(year),
    projectId: projectId === ALL ? undefined : Number(projectId),
    clientId: clientId === ALL ? undefined : Number(clientId),
  });

  // 거래처를 고르면 프로젝트 선택지는 그 거래처의 프로젝트만
  const projects = (filters.data?.projects ?? []).filter((p) => clientId === ALL || String(p.clientId) === clientId);
  const chooseClient = (value: string) => {
    setClientId(value);
    const selected = filters.data?.projects.find((p) => String(p.id) === projectId);
    if (value !== ALL && selected && String(selected.clientId) !== value) setProjectId(ALL);
  };

  const period = year === RECENT ? "최근 12개월" : `${year}년`;
  const filtered = year !== RECENT || clientId !== ALL || projectId !== ALL;
  const narrowed = clientId !== ALL || projectId !== ALL; // 한 거래처·프로젝트만 보면 순위가 의미 없어 숨긴다
  const reset = () => {
    setYear(RECENT);
    setClientId(ALL);
    setProjectId(ALL);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect id="stats-year" label="기간" value={year} onChange={setYear} className="w-36">
          <SelectItem value={RECENT}>최근 12개월</SelectItem>
          {filters.data?.years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}년
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect id="stats-client" label="거래처" value={clientId} onChange={chooseClient} className="w-48">
          <SelectItem value={ALL}>전체 거래처</SelectItem>
          {filters.data?.clients.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
              {c.deleted ? " (삭제된 거래처)" : ""}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect id="stats-project" label="프로젝트" value={projectId} onChange={setProjectId} className="w-56">
          <SelectItem value={ALL}>전체 프로젝트</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              {p.name}
            </SelectItem>
          ))}
        </FilterSelect>
        {filtered && (
          <Button variant="ghost" onClick={reset}>
            <RotateCcw aria-hidden />
            초기화
          </Button>
        )}
      </div>
      {filters.isError && <p className="text-xs text-destructive">필터 목록을 불러오지 못했습니다. 새로고침해 주세요.</p>}

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className={cn("grid gap-4 lg:grid-cols-2", isPlaceholderData && "opacity-60")}>
          <section className="grid content-start gap-2 rounded-lg border p-4">
            <h2 className="text-sm font-medium">월별 매출 ({period}, 청구일 기준, 부가세 포함)</h2>
            <MonthlyAmountChart data={data.monthlySales} label="매출" emptyMessage="이 조건으로 청구한 매출이 없습니다." />
          </section>
          <section className="grid content-start gap-2 rounded-lg border p-4">
            <h2 className="text-sm font-medium">월별 지출 ({period}, 지출일 기준, 공급가액)</h2>
            <MonthlyAmountChart data={data.monthlyExpenses} label="지출" emptyMessage="이 조건으로 기록한 지출이 없습니다." />
          </section>
          {!narrowed && (
            <section className="grid content-start gap-2 rounded-lg border p-4">
              <h2 className="text-sm font-medium">거래처별 매출 순위 ({period}, 상위 10곳)</h2>
              <TopClientsChart data={data.topClients} />
            </section>
          )}
          <section className={cn("grid content-start gap-2 rounded-lg border p-4", narrowed && "lg:col-span-2")}>
            <h2 className="text-sm font-medium">항목별 예산 대비 지출 (기간과 관계없는 누적, 공급가액)</h2>
            <BudgetCompareChart data={data.categories} />
          </section>
        </div>
      )}
    </div>
  );
}

// 통계 필터 한 칸 (라벨 + 선택)
function FilterSelect({
  id,
  label,
  value,
  onChange,
  className,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={cn("max-w-full", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

// 비용 항목 관리 - 숨긴 항목은 새 예산·지출에서 고를 수 없고, 이미 쓴 기록에는 이름이 남는다
function BudgetCategories() {
  const { data, isPending, isError, error, refetch } = useBudgetCategories();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [hiding, setHiding] = useState<BudgetCategory | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useProjectMutation(createBudgetCategory);
  const update = useProjectMutation(({ id, name: next }: { id: number; name: string }) => updateBudgetCategory(id, next));
  const hide = useProjectMutation(deleteBudgetCategory);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (create.isPending || !name.trim()) return;
    setFormError(null);
    try {
      await create.mutateAsync(name.trim());
      toast.success("비용 항목을 추가했습니다.");
      setName("");
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || update.isPending || !editing.name.trim()) return;
    setFormError(null);
    try {
      await update.mutateAsync({ id: editing.id, name: editing.name.trim() });
      toast.success("이름을 바꿨습니다.");
      setEditing(null);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const runHide = async () => {
    if (!hiding) return;
    try {
      await hide.mutateAsync(hiding.id);
      toast.success(`${hiding.name} 항목을 숨겼습니다.`);
      setHiding(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="grid max-w-xl gap-4">
      <p className="text-sm text-muted-foreground">프로젝트의 예산과 지출에서 고르는 전사 공통 항목입니다.</p>
      <FormError message={formError} />

      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="category-name" className="sr-only">
          새 비용 항목 이름
        </label>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="예: 인건비, 외주비, 장비비" />
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          추가
        </Button>
      </form>

      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState message="비용 항목이 없습니다. 항목을 추가해야 프로젝트에서 예산을 편성할 수 있습니다." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editing?.id === c.id ? (
                <form onSubmit={rename} className="flex flex-1 items-center gap-1">
                  <Input value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={50} aria-label={`${c.name} 새 이름`} autoFocus />
                  <Button type="submit" variant="ghost" size="icon-sm" disabled={update.isPending || !editing.name.trim()} aria-label="이름 저장">
                    <Check />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditing(null)} aria-label="이름 변경 취소">
                    <X />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm">{c.name}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={`${c.name} 이름 변경`}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setHiding(c)} aria-label={`${c.name} 숨기기`}>
                    <EyeOff />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={hiding !== null}
        onOpenChange={(open) => !open && setHiding(null)}
        title="비용 항목을 숨길까요?"
        description={`${hiding?.name ?? ""} 항목은 새 예산·지출에서 고를 수 없게 됩니다. 이미 입력한 예산과 지출은 그대로 남습니다.`}
        confirmLabel="숨기기"
        pending={hide.isPending}
        onConfirm={runHide}
      />
    </div>
  );
}
