import { Loader2 } from "lucide-react";

// 로그인 상태 확인 등 화면 전체를 기다려야 할 때 쓰는 로딩 표시
export function FullPageLoader({ label = "불러오는 중입니다" }: { label?: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
