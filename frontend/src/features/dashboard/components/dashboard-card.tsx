import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/common/data-state";

// 대시보드 카드: 제목 + "전체 보기" 링크 + 내용
export function DashboardCard({
  title,
  href,
  actions,
  className,
  children,
}: {
  title: string;
  href?: string;
  actions?: React.ReactNode; // 제목 오른쪽에 두는 버튼·탭
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-lg border bg-card p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate font-semibold">{title}</h2>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            전체 보기
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

// 숫자 하나를 보여 주는 칸 (누르면 해당 화면으로 이동)
export function StatTile({ label, value, unit, href }: { label: string; value: number | string | undefined; unit: string; href: string }) {
  return (
    <Link href={href} className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {value ?? "-"}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
      </p>
    </Link>
  );
}

// 카드 안의 로딩·오류 표시 (데이터가 준비되면 children)
export function CardState({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return <>{children}</>;
}

// 카드 안의 빈 목록 문구
export function CardEmpty({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>;
}
