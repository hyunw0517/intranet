"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/organization", label: "조직도" },
  { href: "/organization/directory", label: "사원 검색" },
];

// 조직도 화면 안의 이동 (조직도 / 사원 검색) - 사이드바 메뉴는 "조직도" 하나 (2026-11-19 사용자 결정)
export function OrgChartNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="조직도" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
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
