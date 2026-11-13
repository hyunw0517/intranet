"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navByVariant, type ShellVariant } from "./nav-items";
import { isActivePath } from "./is-active-path";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "@/features/notification/components/notification-bell";
import { ChatButton } from "@/features/chat/components/chat-button";

// 오른쪽: 테마 선택 · 알림 · 채팅(애드온) · 사용자 메뉴 (직원·관리자 화면 공용, 알림·채팅은 승인 전 GUEST에게 숨김)
export function AppHeader({ variant }: { variant: ShellVariant }) {
  const pathname = usePathname();
  const current = navByVariant[variant].flatMap((group) => group.items).find((item) => isActivePath(pathname, item.href));
  // 게시판 메뉴는 서버에서 받아 오는 목록이라 고정 메뉴에 없다. (게시판 이름은 페이지 제목에 표시)
  const title = current?.title ?? (isActivePath(pathname, "/boards") ? "게시판" : undefined);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" aria-label="사이드바 열기/닫기" />
      <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
      <span className="truncate font-medium">{title}</span>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <NotificationBell />
        <ChatButton />
        <UserMenu />
      </div>
    </header>
  );
}
