"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { badgeCount } from "../chat-display";
import { useChatUnreadTotal } from "../hooks/use-chats";
import { useChat } from "./chat-provider";

// 헤더 채팅 버튼 (알림 종 옆) - 누르면 오른쪽에 떠 있는 채팅 창을 열고 닫는다.
// - 안 읽은 메시지가 있으면 빨간 원 안에 흰 숫자 (100개 이상은 99+). 알림의 빨간 점과 구분된다.
// - 승인 전(GUEST)이거나 채팅 애드온이 꺼져 있으면 표시하지 않는다.
export function ChatButton() {
  const { enabled, open, toggle } = useChat();
  const unread = useChatUnreadTotal(enabled);
  const total = unread.data?.total ?? 0;

  if (!enabled) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={toggle}
      aria-pressed={open}
      aria-label={total > 0 ? `채팅 (읽지 않은 메시지 ${total}개)` : "채팅"}
    >
      <MessageCircle />
      {total > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background tabular-nums"
        >
          {badgeCount(total)}
        </span>
      )}
    </Button>
  );
}
