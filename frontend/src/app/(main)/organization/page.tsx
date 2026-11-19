import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { OrgChartView } from "@/features/org-chart/components/org-chart-view";

export const metadata: Metadata = { title: "조직도" };

export default function OrganizationPage() {
  return (
    <>
      <PageHeader title="조직도" description="부서를 선택하면 그 부서의 구성원을 볼 수 있습니다. 겸직자도 함께 표시됩니다." />
      <OrgChartView />
    </>
  );
}
