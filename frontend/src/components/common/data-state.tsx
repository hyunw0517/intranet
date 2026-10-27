import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-message";

// 데이터 영역의 로딩·빈 목록·오류 표시 (페이지 전체가 아닌 목록·패널 단위)

export function LoadingState({ label = "불러오는 중입니다" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-muted-foreground">{message}</p>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 rounded-lg border px-4 py-10 text-center">
      <p className="text-destructive">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}
