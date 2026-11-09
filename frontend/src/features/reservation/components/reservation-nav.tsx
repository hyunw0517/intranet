"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/reservations", label: "시간표" },
  { href: "/reservations/me", label: "내 예약" },
];

// 시설 예약 화면 안의 이동 (시간표 / 내 예약) - 사이드바 메뉴는 "시설 예약" 하나
export function ReservationNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="시설 예약" className="mb-6 flex gap-1 border-b">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
