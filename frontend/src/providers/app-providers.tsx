"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
            {children}
            <Toaster position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
