import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuoteDetailView } from "@/features/project/components/quote-detail-view";

export const metadata: Metadata = { title: "견적서" };

export default async function QuoteDetailPage({ params }: PageProps<"/projects/[id]/quotes/[quoteId]">) {
  const { id: rawId, quoteId: rawQuote } = await params;
  const id = Number(rawId);
  const quoteId = Number(rawQuote);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quoteId) || quoteId <= 0) notFound();

  return <QuoteDetailView projectId={id} quoteId={quoteId} />;
}
