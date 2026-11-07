import { PageHeader } from "@/components/layout/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="대시보드" description="업무 현황을 한눈에 확인합니다." />
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        대시보드 기능은 아직 구현되지 않았습니다.
      </div>
    </>
  );
}
