import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UserDetailView } from "@/features/admin/components/users/user-detail-view";

export const metadata: Metadata = { title: "회원 상세" };

// URL의 id만 숫자로 확인하고, 조회·표시는 클라이언트 컴포넌트가 한다. (토큰이 브라우저 메모리에 있음)
export default async function AdminUserDetailPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) notFound();

  return <UserDetailView userId={userId} />;
}
