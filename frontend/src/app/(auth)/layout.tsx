import { Suspense } from "react";
import { FullPageLoader } from "@/components/common/full-page-loader";
import { GuestOnlyGate } from "@/features/auth/guards/guest-only-gate";

// 로그인·회원가입 등 인증 화면 레이아웃 (사이드바 없이 가운데 정렬)
// 이미 로그인했으면 GuestOnlyGate가 ?next= 경로로 보낸다.
// GuestOnlyGate가 useSearchParams를 쓰므로 Suspense로 감싼다. (Next.js 빌드 규칙)
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <GuestOnlyGate>
        <main className="flex min-h-svh items-center justify-center bg-sidebar px-4 py-10">
          <div className="w-full max-w-sm rounded-lg border bg-background p-6 sm:p-8">{children}</div>
        </main>
      </GuestOnlyGate>
    </Suspense>
  );
}
