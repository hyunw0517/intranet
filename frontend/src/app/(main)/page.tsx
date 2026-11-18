import { PageHeader } from "@/components/layout/page-header";
import { UserDashboard } from "@/features/dashboard/components/user-dashboard";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="대시보드" description="업무 현황을 한눈에 확인합니다." />
      <UserDashboard />
    </>
  );
}
