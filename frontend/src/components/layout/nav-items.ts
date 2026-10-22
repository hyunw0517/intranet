import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Settings } from "lucide-react";

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
];

export const adminNav: NavGroup[] = [
  {
    label: "관리",
    items: [{ title: "관리자 홈", href: "/admin", icon: Settings }],
  },
];

export type ShellVariant = "main" | "admin";

// 아이콘(컴포넌트)은 서버 → 클라이언트로 props 전달이 불가능하므로
// 서버 레이아웃은 variant만 넘기고 클라이언트 컴포넌트에서 메뉴를 고른다.
export const navByVariant: Record<ShellVariant, NavGroup[]> = {
  main: mainNav,
  admin: adminNav,
};
