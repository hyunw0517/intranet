"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// 프로젝트 탭은 목록(/projects)과 상세(/projects/123)에서 활성으로 본다.
const LINKS = [
  { href: "/projects", label: "프로젝트", match: (p: string) => p === "/projects" || /^\/projects\/\d+/.test(p) },
  { href: "/projects/my-tasks", label: "내 할 일", match: (p: string) => p === "/projects/my-tasks" },
  { href: "/projects/clients", label: "거래처", match: (p: string) => p === "/projects/clients" },
];

// 과제 관리 화면 안의 이동 (프로젝트 / 내 할 일 / 거래처) - 사이드바 메뉴는 "과제 관리" 하나 (2026-11-17 사용자 결정)
export function ProjectNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="과제 관리" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {LINKS.map((link) => {
        const active = link.match(pathname);
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
