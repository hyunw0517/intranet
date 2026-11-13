import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalDetailView } from "@/features/approval/components/approval-detail-view";

export const metadata: Metadata = { title: "결재 문서" };

// 알림의 이동 주소 (백엔드 approvalDocumentLink). id만 숫자로 확인하고 조회·권한 표시는 클라이언트 컴포넌트가 한다.
export default async function ApprovalDetailPage({ params }: PageProps<"/approvals/[id]">) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  return <ApprovalDetailView id={id} />;
}
