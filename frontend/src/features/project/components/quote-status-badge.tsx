import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABEL, type QuoteDisplayStatus } from "@/types/project";

// 견적 상태 배지 - 확정만 강조, 반려는 경고, 나머지는 차분하게 (요구사항 2.1)
export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
  const variant = status === "CONFIRMED" ? "default" : status === "REJECTED" ? "destructive" : status === "IN_APPROVAL" ? "secondary" : "outline";
  return <Badge variant={variant}>{QUOTE_STATUS_LABEL[status]}</Badge>;
}
