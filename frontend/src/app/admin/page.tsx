import { PageHeader } from "@/components/layout/page-header";
import { AdminHomeLinks } from "@/features/admin/components/admin-home-links";

export default function AdminHomePage() {
  return (
    <>
      <PageHeader title="관리자 홈" description="회원·조직·게시판 등 인트라넷 설정을 관리합니다." />
      {/* 바로가기는 로그인한 관리자의 기능 권한에 따라 달라서 클라이언트 컴포넌트로 둔다. */}
      <AdminHomeLinks />
    </>
  );
}
