import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { DirectoryView } from "@/features/org-chart/components/directory-view";

export const metadata: Metadata = { title: "사원 검색" };

export default function DirectoryPage() {
  return (
    <>
      <PageHeader title="사원 검색" description="이름·사번·부서명으로 직원을 찾고 연락처를 확인합니다." />
      <DirectoryView />
    </>
  );
}
