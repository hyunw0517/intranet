import { OrgChartNav } from "@/features/org-chart/components/org-chart-nav";

// 조직도 (핵심 기능, USER 이상) - 하위 탭(조직도 / 사원 검색)만 공통으로 두고 제목은 각 페이지에서 그린다
export default function OrganizationLayout({ children }: LayoutProps<"/organization">) {
  return (
    <>
      <OrgChartNav />
      {children}
    </>
  );
}
