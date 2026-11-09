"use client";

import { notFound } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import type { AddonName } from "@/services/api/addons";
import { useEnabledAddons } from "../hooks/use-addons";

// 애드온 페이지 접근 제어: 꺼진 애드온 주소로 직접 들어오면 일반 404 페이지 (2026-11-09 사용자 결정)
// - 꺼진 애드온은 서버에 API 자체가 없으므로(404) 화면도 같은 취급을 한다.
// - 화면만 가리는 것이므로 실제 차단은 서버(애드온 모듈 미등록)가 한다.
// - 레이아웃(app/(main)/reservations/layout.tsx 등)에서 감싸 하위 페이지 전체에 적용한다.
export function AddonGate({ name, children }: { name: AddonName; children: React.ReactNode }) {
  const { data, isPending, isError, error, refetch } = useEnabledAddons();

  if (isPending) return <LoadingState />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data.enabled.includes(name)) notFound();

  return <>{children}</>;
}
