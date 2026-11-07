import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { MypageView } from "@/features/mypage/components/mypage-view";

export const metadata: Metadata = { title: "마이페이지" };

export default function MypagePage() {
  return (
    <>
      <PageHeader title="마이페이지" description="내 계정 정보를 확인하고 수정합니다." />
      <MypageView />
    </>
  );
}
