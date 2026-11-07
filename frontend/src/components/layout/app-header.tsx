"use client";

import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navByVariant, type ShellVariant } from "./nav-items";
import { isActivePath } from "./is-active-path";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

// 알림은 해당 기능 구현 시 추가한다. (미구현 기능을 동작하는 것처럼 표시하지 않음)
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
        <UserMenu />
      </div>
    </header>
  );
}
