"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { FullPageLoader } from "@/components/common/full-page-loader";
import { useAuth } from "@/providers/auth-provider";
import { getSafeRedirect } from "../safe-redirect";

// 로그인·회원가입 화면용: 이미 로그인했으면 ?next= 경로(없으면 /)로 보낸다.
export function GuestOnlyGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(getSafeRedirect(searchParams.get("next")));
    }
  }, [status, searchParams, router]);

  if (status !== "unauthenticated") return <FullPageLoader />;

  return <>{children}</>;
}
