import type { Metadata } from "next";
import { ApprovalWriteView } from "@/features/approval/components/approval-write-view";

export const metadata: Metadata = { title: "새 결재 문서" };

export default function ApprovalNewPage() {
  return <ApprovalWriteView />;
}
