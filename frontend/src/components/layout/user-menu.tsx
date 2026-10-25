"use client";

import Link from "next/link";
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
import { ROLE_LABEL } from "@/types/user";
import { useAuth } from "@/providers/auth-provider";

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  // 로그인 페이지 이동은 AuthGate가 처리한다. (로그인 상태가 풀리면 /login?next=현재경로)
  const handleLogout = () => {
    void logout();
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
