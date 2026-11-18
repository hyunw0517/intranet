"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/common/data-state";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatAmount, type BudgetCategorySummary, type MonthlyAmount } from "@/types/project";

// 매출·예산 그래프 (recharts). 무거운 라이브러리라 charts-lazy.tsx를 거쳐 그래프가 있는 화면에서만 불러온다.
// 금액은 문자열로 오지만 막대 길이 계산에는 숫자가 필요하다. 999조 이하라 Number로 정확히 표현된다.
const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });
const axisAmount = (value: number) => (value === 0 ? "0" : compact.format(value));
// 가로축: 첫 칸과 1월에는 연도를 함께 적어 해가 바뀌는 지점을 알 수 있게 한다 ('26.1)
const monthTick = (month: string, index: number) => {
  const m = Number(month.slice(5));
  return index === 0 || m === 1 ? `'${month.slice(2, 4)}.${m}` : `${m}월`;
};
const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;

// 툴팁 한 줄: 이름 + 금액
function amountRow(config: ChartConfig) {
  return function AmountRow(value: unknown, name: unknown) {
    return (
      <div className="flex w-full items-center justify-between gap-4">
        <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
        <span className="font-medium tabular-nums text-foreground">{formatAmount(String(value))}</span>
      </div>
    );
  };
}

// 월별 금액 막대 (매출·지출 공용)
export function MonthlyAmountChart({ data, label, emptyMessage }: { data: MonthlyAmount[]; label: string; emptyMessage: string }) {
  if (data.every((d) => Number(d.amount) === 0)) return <EmptyState message={emptyMessage} />;

  const config = { amount: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  const rows = data.map((d) => ({ month: d.month, amount: Number(d.amount) }));

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full" role="img" aria-label={`최근 12개월 ${label} 막대 그래프`}>
      <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={monthTick} interval={0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axisAmount} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => monthLabel(String(value))} formatter={amountRow(config)} />} />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  );
}

// 항목별 예산 대비 지출 - 예산을 넘은 항목의 지출 막대는 빨간색
export function BudgetCompareChart({ data }: { data: BudgetCategorySummary[] }) {
  if (data.length === 0) return <EmptyState message="예산이나 지출을 입력하면 항목별로 비교해 보여 줍니다." />;

  const config = {
    budget: { label: "예산", color: "var(--chart-3)" },
    spent: { label: "지출", color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const rows = data.map((c) => ({ name: c.name, budget: Number(c.budgetAmount), spent: Number(c.spentAmount), over: c.over }));

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full" role="img" aria-label="비용 항목별 예산 대비 지출 막대 그래프">
      <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} interval={0} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={axisAmount} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent formatter={amountRow(config)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="budget" fill="var(--color-budget)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="spent" fill="var(--color-spent)" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.over ? "var(--destructive)" : "var(--color-spent)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// 거래처별 매출 순위 (가로 막대, 상위 10곳)
export function TopClientsChart({ data }: { data: { clientId: number; name: string; amount: string }[] }) {
  if (data.length === 0) return <EmptyState message="최근 12개월 동안 청구한 매출이 없습니다." />;

  const config = { amount: { label: "매출", color: "var(--chart-1)" } } satisfies ChartConfig;
  const rows = data.map((c) => ({ name: c.name, amount: Number(c.amount) }));

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height: Math.max(160, rows.length * 34) }}
      role="img"
      aria-label="거래처별 매출 순위 가로 막대 그래프"
    >
      <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisAmount} fontSize={11} />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={96} interval={0} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent formatter={amountRow(config)} />} />
        <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 3, 3, 0]} maxBarSize={20} />
      </BarChart>
    </ChartContainer>
  );
}
