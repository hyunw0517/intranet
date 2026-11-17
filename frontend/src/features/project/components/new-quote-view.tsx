"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { useProject } from "../hooks/use-projects";
import { QuoteEditor } from "./quote-editor";

// 새 견적 화면 - 프로젝트의 발주처(거래처)가 있어야 쓸 수 있다
export function NewQuoteView({ projectId }: { projectId: number }) {
  const project = useProject(projectId);

  if (project.isPending) return <LoadingState />;
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />;
  const p = project.data;

  return (
    <>
      <Link href={`/projects/${projectId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {p.name}
      </Link>
      <PageHeader title="새 견적" description={p.client ? `발주처: ${p.client.name} · 견적번호는 저장할 때 매겨집니다.` : undefined} />
      {p.clientId ? (
        <QuoteEditor projectId={projectId} clientId={p.clientId} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">견적을 쓰려면 프로젝트 [수정]에서 거래처(발주처)를 먼저 지정해 주세요.</p>
      )}
    </>
  );
}
