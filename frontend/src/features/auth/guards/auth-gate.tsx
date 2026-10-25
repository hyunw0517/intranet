"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullPageLoader } from "@/components/common/full-page-loader";
import { useAuth } from "@/providers/auth-provider";

// 로그인한 사용자만 children을 보여 준다. 로그인하지 않았으면 /login?next=현재경로 로 보낸다.
// 화면을 가리는 용도이며, 실제 데이터 보호는 백엔드 AccessTokenGuard가 담당한다.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  if (status !== "authenticated") return <FullPageLoader />;

  return <>{children}</>;
}
