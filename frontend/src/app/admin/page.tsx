import { PageHeader } from "@/components/layout/page-header";

export default function AdminHomePage() {
  return (
    <>
      <PageHeader title="관리자 홈" description="회원·조직·게시판 등 인트라넷 설정을 관리합니다." />
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        관리자 기능은 아직 구현되지 않았습니다.
      </div>
    </>
  );
}
