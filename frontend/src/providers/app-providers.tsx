"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatProvider } from "@/features/chat/components/chat-provider";
import { AuthProvider } from "./auth-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        {/* AuthProvider는 로그아웃 시 Query 캐시를 비우므로 QueryProvider 안쪽에 둔다. */}
        <AuthProvider>
          <TooltipProvider delayDuration={300}>
            {/* 채팅(애드온): 떠 있는 창과 소켓 연결을 페이지 이동과 무관하게 유지하려고 루트에 둔다. 로그인 전·GUEST·애드온 꺼짐이면 아무것도 하지 않는다. */}
            <ChatProvider>{children}</ChatProvider>
            <Toaster position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
