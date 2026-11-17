import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ClientListView } from "@/features/project/components/client-list-view";

export const metadata: Metadata = { title: "거래처" };

export default function ClientsPage() {
  return (
    <>
      <PageHeader title="거래처" description="프로젝트·견적에 연결하는 고객사와 담당자를 관리합니다. 누구나 등록·수정할 수 있습니다." />
      <ClientListView />
    </>
  );
}
