import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalEditView } from "@/features/approval/components/approval-write-view";

export const metadata: Metadata = { title: "결재 문서 수정" };

export default async function ApprovalEditPage({ params }: PageProps<"/approvals/[id]/edit">) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  return <ApprovalEditView id={id} />;
}
