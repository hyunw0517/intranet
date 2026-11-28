import { OrgChartNav } from "@/features/org-chart/components/org-chart-nav";

// 조직도 - 하위 탭만 공통으로 두고 제목은 각 페이지에서 그린다
export default function OrganizationLayout({ children }: LayoutProps<"/organization">) {
  return (
    <>
      <OrgChartNav />
      {children}
    </>
  );
}
