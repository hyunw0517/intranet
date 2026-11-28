"use client";

import { notFound } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import type { AddonName } from "@/services/api/addons";
import { useEnabledAddons } from "../hooks/use-addons";

// 애드온 페이지 접근 제어: 꺼진 애드온 주소면 일반 404
// 화면만 가리는 것이고, 실제로는 서버에 그 API가 없다. 레이아웃에서 감싸 하위 페이지 전체에 적용한다.
export function AddonGate({ name, children }: { name: AddonName; children: React.ReactNode }) {
  const { data, isPending, isError, error, refetch } = useEnabledAddons();

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data.enabled.includes(name)) notFound();

  return <>{children}</>;
}
