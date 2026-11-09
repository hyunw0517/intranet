import type { LucideIcon } from "lucide-react";
import { Building, CalendarClock, CalendarRange, LayoutDashboard, LayoutList, Network, Settings, UserRound, Users } from "lucide-react";
import { isGuestAllowedPath } from "@/lib/guest-access";
import type { AddonName } from "@/services/api/addons";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  addon?: AddonName; // 애드온 메뉴: 그 애드온이 켜져 있을 때만 보인다. (GET /common/addons)
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// 메뉴는 실제로 구현된 페이지만 등록한다. (기능 작업 시 항목 추가)
export const mainNav: NavGroup[] = [
  {
    label: "업무",
    items: [
      { title: "대시보드", href: "/", icon: LayoutDashboard },
      { title: "시설 예약", href: "/reservations", icon: CalendarClock, addon: "reservations" },
    ],
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
      { title: "게시판 관리", href: "/admin/boards", icon: LayoutList },
      { title: "시설 관리", href: "/admin/facilities", icon: Building, addon: "reservations" },
      { title: "예약 관리", href: "/admin/reservations", icon: CalendarRange, addon: "reservations" },
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

// 켜지지 않은 애드온의 메뉴를 뺀다. (목록을 아직 못 받았으면 애드온 메뉴는 모두 숨김, 비어 버린 그룹은 제외)
export function filterNavForAddons(nav: NavGroup[], enabled: AddonName[] | undefined): NavGroup[] {
  return nav
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.addon || (enabled ?? []).includes(item.addon)) }))
    .filter((group) => group.items.length > 0);
}

// GUEST에게는 접근 가능한 경로(lib/guest-access)의 메뉴만 보여 준다. (비어 버린 그룹은 제외)
export function filterNavForRole(nav: NavGroup[], role: string | undefined): NavGroup[] {
  if (role !== "GUEST") return nav;
  return nav
    .map((group) => ({ ...group, items: group.items.filter((item) => isGuestAllowedPath(item.href)) }))
    .filter((group) => group.items.length > 0);
}
