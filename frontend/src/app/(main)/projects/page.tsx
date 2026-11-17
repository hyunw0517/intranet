import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectListView } from "@/features/project/components/project-list-view";

export const metadata: Metadata = { title: "과제 관리" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="프로젝트" description="참여한 프로젝트의 진행 상황을 보고 과제를 관리합니다." />
      <ProjectListView />
    </>
  );
}
