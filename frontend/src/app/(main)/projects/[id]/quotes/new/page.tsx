import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NewQuoteView } from "@/features/project/components/new-quote-view";

export const metadata: Metadata = { title: "새 견적" };

// 새 견적 (v1 작성) - 발주처 확인·권한은 클라이언트 컴포넌트와 서버가 한다
export default async function NewQuotePage({ params }: PageProps<"/projects/[id]/quotes/new">) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  return <NewQuoteView projectId={id} />;
}
