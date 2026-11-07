import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/common/data-state";
import { PageHeader } from "@/components/layout/page-header";
import { UserListView } from "@/features/admin/components/users/user-list-view";

export const metadata: Metadata = { title: "회원 관리" };

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="회원 관리" description="가입 승인, 권한·상태, 직급·소속을 관리합니다." />
      {/* 목록이 필터를 URL 검색 파라미터(useSearchParams)로 읽으므로 Suspense가 필요하다. */}
      <Suspense fallback={<LoadingState />}>
        <UserListView />
      </Suspense>
    </>
  );
}
