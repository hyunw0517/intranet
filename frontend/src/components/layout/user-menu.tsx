"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/features/auth/types";
import { useAuth } from "@/providers/auth-provider";

const ROLE_LABEL: Record<UserRole, string> = {
  GUEST: "승인 대기",
  USER: "직원",
  ADMIN: "관리자",
};

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5" aria-label="사용자 메뉴">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{user.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate sm:inline">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid gap-1">
          <span className="flex items-center gap-2">
            <span className="truncate">{user.name}</span>
            <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {user.empNo} · {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/mypage">
            <UserRound />
            마이페이지
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
