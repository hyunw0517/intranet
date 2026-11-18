import { PageHeader } from "@/components/layout/page-header";
import { AdminDashboard } from "@/features/dashboard/components/admin-dashboard";

export default function AdminHomePage() {
  return (
    <>
      <PageHeader title="대시보드" description="담당하는 관리 기능의 현황을 한눈에 확인합니다." />
      <AdminDashboard />
    </>
  );
}
