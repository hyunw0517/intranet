import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Network, Settings, UserRound, Users } from "lucide-react";
import { isGuestAllowedPath } from "@/lib/guest-access";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// 메뉴는 실제로 구현된 페이지만 등록한다. (기능 작업 시 항목 추가)
export const mainNav: NavGroup[] = [
  {
    label: "업무",
    items: [{ title: "대시보드", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "개인",
    items: [{ title: "마이페이지", href: "/mypage", icon: UserRound }],
  },
];

export const adminNav: NavGroup[] = [
  {
    label: "관리",
    items: [
      { title: "관리자 홈", href: "/admin", icon: Settings },
      { title: "회원 관리", href: "/admin/users", icon: Users },
      { title: "조직 관리", href: "/admin/organization", icon: Network },
    ],
  },
];

export type ShellVariant = "main" | "admin";

// 아이콘(컴포넌트)은 서버 → 클라이언트로 props 전달이 불가능하므로
// 서버 레이아웃은 variant만 넘기고 클라이언트 컴포넌트에서 메뉴를 고른다.
export const navByVariant: Record<ShellVariant, NavGroup[]> = {
  main: mainNav,
  admin: adminNav,
};

// GUEST에게는 접근 가능한 경로(lib/guest-access)의 메뉴만 보여 준다. (비어 버린 그룹은 제외)
export function filterNavForRole(nav: NavGroup[], role: string | undefined): NavGroup[] {
  if (role !== "GUEST") return nav;
  return nav
    .map((group) => ({ ...group, items: group.items.filter((item) => isGuestAllowedPath(item.href)) }))
    .filter((group) => group.items.length > 0);
}
