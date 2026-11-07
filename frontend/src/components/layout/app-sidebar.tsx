"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Building2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/providers/auth-provider";
import { filterNavForRole, navByVariant, type ShellVariant } from "./nav-items";
import { isActivePath } from "./is-active-path";

interface AppSidebarProps {
  variant: ShellVariant;
  extraNav?: React.ReactNode; // 고정 메뉴의 첫 그룹 다음에 표시 (업무 → 게시판 → 개인)
}

export function AppSidebar({ variant, extraNav }: AppSidebarProps) {
  const { user } = useAuth();
  const nav = filterNavForRole(navByVariant[variant], user?.role);
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const isAdmin = variant === "admin";

  // 모바일 Sheet는 메뉴 이동 후 닫는다.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAdmin ? "/admin" : "/"} onClick={closeOnMobile}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Building2 className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">Intranet</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isAdmin ? "관리자" : "사내 인트라넷"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group, index) => (
          <Fragment key={group.label}>
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActivePath(pathname, item.href)}
                    >
                      <Link href={item.href} onClick={closeOnMobile}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            {index === 0 && extraNav}
          </Fragment>
        ))}
      </SidebarContent>

      {/* 관리자 화면 ↔ 직원 화면 이동은 ADMIN에게만 보여 준다. */}
      {user?.role === "ADMIN" && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={isAdmin ? "직원 화면" : "관리자 화면"}>
                <Link href={isAdmin ? "/" : "/admin"} onClick={closeOnMobile}>
                  <ArrowLeftRight />
                  <span>{isAdmin ? "직원 화면으로" : "관리자 화면으로"}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
