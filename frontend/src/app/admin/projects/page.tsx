import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DeletedProjectsView } from "@/features/project/components/deleted-projects-view";

export const metadata: Metadata = { title: "프로젝트 관리" };

// 전체 프로젝트 열람은 직원 화면 과제 관리의 "전체 프로젝트" 범위에서 한다. 여기서는 삭제된 프로젝트 복구만.
export default function AdminProjectsPage() {
  return (
    <>
      <PageHeader title="프로젝트 관리" description="삭제된 프로젝트를 보고 복구합니다. 전체 프로젝트는 과제 관리 화면의 '전체 프로젝트'에서 볼 수 있습니다." />
      <DeletedProjectsView />
    </>
  );
}
