"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/approvals", label: "결재함" },
  { href: "/approvals/lines", label: "결재라인" },
];

// 전자결재 화면 안의 이동 (결재함 / 결재라인) - 사이드바 메뉴는 "전자결재" 하나 (시설 예약과 같은 방식)
export function ApprovalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="전자결재" className="mb-6 flex gap-1 border-b">
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
