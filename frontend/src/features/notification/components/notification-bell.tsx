"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error-message";
import { formatListDate } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import {
  deleteNotification,
  deleteReadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/services/api/notifications";
import { useNotificationList, useNotificationMutation, useUnreadNotificationCount } from "../hooks/use-notifications";

// 헤더 알림 (테마 선택과 사용자 메뉴 사이)
// - 안 읽은 알림이 있으면 아이콘에 빨간 점
// - 누르면 받은 알림 목록, 아래에 [모두 읽음] [읽은 알림 삭제]
// - 승인 전(GUEST)은 알림 API를 쓸 수 없어(403) 아이콘을 표시하지 않는다.
export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const canUse = !!user && user.role !== "GUEST";

  const unread = useUnreadNotificationCount(canUse);
  const unreadCount = unread.data?.count ?? 0;

  if (!canUse) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `알림 (읽지 않은 알림 ${unreadCount}개)` : "알림"}
        >
          <Bell />
          {unreadCount > 0 && (
            <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] p-0 sm:w-96">
        {/* 목록 조회는 열렸을 때만 (닫힌 동안에는 안 읽은 수만 주기적으로 조회) */}
        {open && <NotificationPanel unreadCount={unreadCount} onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function NotificationPanel({ unreadCount, onNavigate }: { unreadCount: number; onNavigate: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const list = useNotificationList(true);
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];

  const readOne = useNotificationMutation((id: string) => markNotificationRead(id));
  const removeOne = useNotificationMutation((id: string) => deleteNotification(id));
  const readAll = useNotificationMutation(() => markAllNotificationsRead());
  const removeRead = useNotificationMutation(() => deleteReadNotifications());

  // 알림을 누르면: 안 읽었으면 읽음 처리 → 창을 닫고 저장된 주소로 이동
  // - 이미 그 화면에 있으면 router.push가 아무 일도 하지 않는다(같은 주소). 그러면 새 댓글 등이 보이지 않으므로
  //   화면에 떠 있는 조회를 모두 다시 불러온다. (다른 기능의 queryKey를 import하지 않기 위해 특정 키 대신 활성 쿼리 전체)
  const handleOpen = (item: NotificationItem) => {
    if (!item.isRead) readOne.mutate(item.id);
    onNavigate();
    if (!item.link) return;

    if (item.link.split(/[?#]/)[0] === pathname) {
      void queryClient.invalidateQueries({ refetchType: "active" });
    } else {
      router.push(item.link);
    }
  };

  const handleRemove = (id: string) =>
    removeOne.mutate(id, { onError: (error) => toast.error(getErrorMessage(error)) });

  const handleReadAll = () =>
    readAll.mutate(undefined, { onError: (error) => toast.error(getErrorMessage(error)) });

  const handleRemoveRead = () =>
    removeRead.mutate(undefined, {
      onSuccess: (result) =>
        result.count > 0 ? toast.success(`읽은 알림 ${result.count}개를 삭제했습니다.`) : toast.info("삭제할 읽은 알림이 없습니다."),
      onError: (error) => toast.error(getErrorMessage(error)),
    });

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-medium">알림</p>
        {unreadCount > 0 && <p className="text-sm text-muted-foreground">읽지 않음 {unreadCount}개</p>}
      </div>

      <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
        {list.isPending ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            불러오는 중입니다
          </p>
        ) : list.isError ? (
          <div className="grid justify-items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <p>{getErrorMessage(list.error)}</p>
            <Button variant="outline" size="sm" onClick={() => list.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">받은 알림이 없습니다.</p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={() => handleOpen(item)}
                onRemove={() => handleRemove(item.id)}
                removing={removeOne.isPending && removeOne.variables === item.id}
              />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
              더 보기
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t p-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={handleReadAll} disabled={unreadCount === 0 || readAll.isPending}>
          {readAll.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
          모두 읽음
        </Button>
        <Button variant="ghost" size="sm" className="flex-1" onClick={handleRemoveRead} disabled={items.length === 0 || removeRead.isPending}>
          {removeRead.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          읽은 알림 삭제
        </Button>
      </div>
    </div>
  );
}

// 한 줄: [안 읽음 점] 제목 / 내용(2줄) / 보낸 사람 · 시각  [×]
function NotificationRow({
  item,
  onOpen,
  onRemove,
  removing,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <li className="group relative flex items-start gap-2 px-4 py-3 hover:bg-muted/50">
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.isRead ? "bg-transparent" : "bg-primary")}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
        <span className="sr-only">{item.isRead ? "읽음" : "읽지 않음"}: </span>
        <span className={cn("block text-sm", item.isRead ? "text-muted-foreground" : "font-medium")}>{item.title}</span>
        {item.content && (
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.content}</span>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">
          {item.sender ? `${item.sender.name} · ` : ""}
          {formatListDate(item.createdAt)}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground"
        onClick={onRemove}
        disabled={removing}
        aria-label="알림 삭제"
      >
        {removing ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
      </Button>
    </li>
  );
}
