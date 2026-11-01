"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronRight, FileText, Folder, Images, Megaphone, RotateCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isActivePath } from "@/components/layout/is-active-path";
import { useAuth } from "@/providers/auth-provider";
import type { BoardNavItem, BoardType } from "@/types/board";
import { useBoardNavigation } from "../hooks/use-board-navigation";

const BOARD_ICON: Record<BoardType, LucideIcon> = {
  CATEGORY: Folder,
  NORMAL: FileText,
  NOTICE: Megaphone,
  CALENDAR: CalendarDays,
  ALBUM: Images,
};

export const boardHref = (id: number) => `/boards/${id}`;

// 카테고리(최상위) → 하위 게시판 묶음. 카테고리가 아닌 최상위 게시판은 하위가 없는 항목이 된다.
interface BoardNavNode {
  board: BoardNavItem;
  children: BoardNavItem[];
}

function toNodes(boards: BoardNavItem[]): BoardNavNode[] {
  const nodes = boards.filter((b) => b.depth === 0).map((board) => ({ board, children: [] as BoardNavItem[] }));
  const byId = new Map(nodes.map((node) => [node.board.id, node]));
  for (const b of boards) {
    if (b.depth > 0 && b.parentBoardId !== null) byId.get(b.parentBoardId)?.children.push(b);
  }
  return nodes;
}

// 직원용 사이드바의 "게시판" 메뉴 (서버가 읽기 권한으로 거른 목록을 그대로 표시)
export function BoardNavGroup() {
  const { user } = useAuth();
  const { data, isPending, isError, refetch } = useBoardNavigation();
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state, setOpen } = useSidebar();

  const nodes = data ? toNodes(data) : [];
  const activeCategoryId =
    nodes.find((node) => node.children.some((child) => isActivePath(pathname, boardHref(child.id))))?.board.id ?? null;

  // 펼친 카테고리 id. 다른 화면에서 게시판으로 이동하면 그 게시판의 카테고리를 펼친다.
  // (effect 대신 렌더링 중에 이전 값과 비교해 갱신 - React 권장 패턴)
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [prevActiveId, setPrevActiveId] = useState<number | null>(null);
  if (activeCategoryId !== prevActiveId) {
    setPrevActiveId(activeCategoryId);
    if (activeCategoryId !== null && !openIds.has(activeCategoryId)) {
      setOpenIds(new Set(openIds).add(activeCategoryId));
    }
  }

  const setCategoryOpen = (id: number, open: boolean) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  // 승인 전 회원은 게시판을 이용할 수 없다. (메뉴 자체를 숨김)
  if (!user || user.role === "GUEST") return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>게시판</SidebarGroupLabel>

      {isPending && (
        <SidebarMenu>
          {Array.from({ length: 3 }, (_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      )}

      {isError && (
        <>
          <SidebarGroupAction onClick={() => refetch()} title="게시판 다시 불러오기">
            <RotateCw />
            <span className="sr-only">게시판 다시 불러오기</span>
          </SidebarGroupAction>
          <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            게시판을 불러오지 못했습니다.
          </p>
        </>
      )}

      {data && nodes.length === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          볼 수 있는 게시판이 없습니다.
        </p>
      )}

      {nodes.length > 0 && (
        <SidebarMenu>
          {nodes.map(({ board, children }) => {
            const Icon = BOARD_ICON[board.type];

            if (board.type !== "CATEGORY") {
              return (
                <SidebarMenuItem key={board.id}>
                  <SidebarMenuButton
                    asChild
                    tooltip={board.name}
                    isActive={isActivePath(pathname, boardHref(board.id))}
                  >
                    <Link href={boardHref(board.id)} onClick={closeOnMobile}>
                      <Icon />
                      <span>{board.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }

            const open = openIds.has(board.id);
            return (
              <Collapsible
                key={board.id}
                asChild
                open={open}
                onOpenChange={(next) => setCategoryOpen(board.id, next)}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip={board.name}
                      // 아이콘만 보이는 접힌 사이드바에서는 하위 메뉴가 보이지 않으므로 사이드바를 펼친다.
                      onClick={() => {
                        if (state === "collapsed") setOpen(true);
                      }}
                      isActive={state === "collapsed" && activeCategoryId === board.id}
                    >
                      <Icon />
                      <span>{board.name}</span>
                      <ChevronRight
                        className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                        aria-hidden
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {children.map((child) => (
                        <SidebarMenuSubItem key={child.id}>
                          <SidebarMenuSubButton asChild isActive={isActivePath(pathname, boardHref(child.id))}>
                            <Link href={boardHref(child.id)} onClick={closeOnMobile}>
                              <span>{child.name}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
        </SidebarMenu>
      )}
    </SidebarGroup>
  );
}
