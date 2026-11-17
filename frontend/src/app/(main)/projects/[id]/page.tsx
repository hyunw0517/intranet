import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LoadingState } from "@/components/common/data-state";
import { ProjectDetailView } from "@/features/project/components/project-detail-view";

export const metadata: Metadata = { title: "프로젝트" };

// 알림의 이동 주소 (/projects/:id, 과제 알림은 ?task=:taskId). id만 숫자로 확인하고 조회·권한은 클라이언트 컴포넌트가 한다.
// 상세가 ?task를 읽으므로(useSearchParams) Suspense로 감싼다.
export default async function ProjectDetailPage({ params }: PageProps<"/projects/[id]">) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  return (
    <Suspense fallback={<LoadingState />}>
      <ProjectDetailView id={id} />
    </Suspense>
  );
}
