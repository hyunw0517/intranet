"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// recharts는 용량이 커서 그래프가 실제로 그려지는 탭·화면에서만 불러온다 (브라우저 크기 측정이 필요해 서버 렌더링도 끈다)
const loading = () => <Skeleton className="h-60 w-full" />;

export const MonthlyAmountChart = dynamic(() => import("./project-charts").then((m) => m.MonthlyAmountChart), { ssr: false, loading });
export const BudgetCompareChart = dynamic(() => import("./project-charts").then((m) => m.BudgetCompareChart), { ssr: false, loading });
export const TopClientsChart = dynamic(() => import("./project-charts").then((m) => m.TopClientsChart), { ssr: false, loading });
