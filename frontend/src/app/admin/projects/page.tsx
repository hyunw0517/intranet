import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdminProjectsView } from "@/features/project/components/admin-projects-view";

export const metadata: Metadata = { title: "프로젝트 관리" };

// 전체 프로젝트 열람은 직원 화면에서 한다. 여기서는 전사 통계·비용 항목·삭제된 프로젝트 복구.
export default function AdminProjectsPage() {
  return (
    <>
      <PageHeader title="프로젝트 관리" description="전사 매출·지출 통계를 보고, 비용 항목과 삭제된 프로젝트를 관리합니다." />
      <AdminProjectsView />
    </>
  );
}
