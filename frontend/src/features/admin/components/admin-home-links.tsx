"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/common/data-state";
import { hasAdminPermission } from "@/lib/admin-permission";
import { useAuth } from "@/providers/auth-provider";
import type { AdminPermission } from "@/types/user";

// 구현된 관리 화면 바로가기 (기능이 생기면 항목 추가)
// 지정된 관리자 기능의 화면만 보여 준다. (SUPER_ADMIN은 전부)
const ADMIN_LINKS: { href: string; title: string; description: string; permission: AdminPermission }[] = [
  { href: "/admin/users", title: "회원 관리", description: "가입 승인, 권한·상태, 직급·소속, 비밀번호 초기화", permission: "USERS" },
  { href: "/admin/organization", title: "조직 관리", description: "부서 트리, 직급, 직책", permission: "ORGANIZATION" },
  { href: "/admin/boards", title: "게시판 관리", description: "카테고리·게시판, 게시판별 권한 규칙", permission: "BOARDS" },
];

export function AdminHomeLinks() {
  const { user } = useAuth();
  const links = ADMIN_LINKS.filter((link) => hasAdminPermission(user, link.permission));

  if (user?.role === "ADMIN" && (user.adminPermissions ?? []).length === 0) {
    return <EmptyState message="지정된 관리자 기능이 없습니다. 슈퍼관리자에게 필요한 기능을 요청하세요." />;
  }

  // 바로가기가 없는 기능(애드온 관리 화면)만 가진 관리자
  if (links.length === 0) {
    return <EmptyState message="왼쪽 메뉴에서 관리 화면을 선택하세요." />;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <div>
              <p className="font-medium">{link.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
