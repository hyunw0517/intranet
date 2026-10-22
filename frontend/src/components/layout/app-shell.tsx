import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import type { ShellVariant } from "./nav-items";

interface AppShellProps {
  variant: ShellVariant;
  children: React.ReactNode;
}

// 직원용 (main)과 관리자용 admin 레이아웃이 공유하는 셸 (사이드바 + 헤더 + 콘텐츠)
export async function AppShell({ variant, children }: AppShellProps) {
  // 사이드바 접힘 상태는 shadcn sidebar가 쿠키에 저장한다. 서버에서 읽어 첫 렌더링부터 맞춘다.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar variant={variant} />
      <SidebarInset>
        <AppHeader variant={variant} />
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
