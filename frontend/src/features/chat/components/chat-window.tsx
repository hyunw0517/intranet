"use client";

import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraggableWindow } from "../hooks/use-draggable-window";
import { ChatNewRoom } from "./chat-new-room";
import { ChatRoomList } from "./chat-room-list";
import { ChatRoomView } from "./chat-room-view";
import { useChat } from "./chat-provider";

// 오른쪽 아래에 떠 있는 채팅 창 (뒤 화면을 덮지 않아 창을 띄운 채로 다른 메뉴를 쓸 수 있다)
// - PC·태블릿: 380px 너비, 화면 높이에 맞춰 최대 640px. 헤더(56px) 아래로 넘어가지 않는다.
// - 모바일(<640px): 작은 창이 너무 좁아 화면 전체로 연다.
// - 오른쪽 위 토스트(Toaster top-right)와 겹치지 않도록 아래쪽에 붙인다.
// - PC·태블릿은 위쪽 줄을 잡고 옮길 수 있다(use-draggable-window). 닫았다 열면 원래 자리.
export function ChatWindow() {
  const { view } = useChat();
  const { ref, style, dragging, handlers } = useDraggableWindow();

  return (
    <section
      ref={ref}
      style={style}
      {...handlers}
      aria-label="채팅"
      className={cn(
        "fixed inset-0 z-40 flex flex-col overflow-hidden bg-background sm:inset-auto sm:right-4 sm:bottom-4 sm:h-[min(640px,calc(100dvh-5rem))] sm:w-[380px] sm:rounded-xl sm:border sm:shadow-lg",
        dragging && "select-none",
      )}
    >
      {view.type === "list" && <ChatRoomList />}
      {view.type === "new" && <ChatNewRoom />}
      {/* key: 방을 바꾸면 입력 중인 글·스크롤 상태를 새로 시작 */}
      {view.type === "room" && <ChatRoomView key={view.roomId} roomId={view.roomId} />}
    </section>
  );
}

// 창 안 화면마다 쓰는 상단 줄: [← 뒤로] 제목 / 보조 문구 ... [추가 버튼] [× 닫기]
export function ChatPanelHeader({
  title,
  subtitle,
  onBack,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  actions?: React.ReactNode;
}) {
  const { close } = useChat();

  return (
    // data-chat-drag-handle: 이 줄을 잡고 창을 옮긴다 (버튼 위에서는 시작하지 않음, 두 번 누르면 원래 자리)
    <div
      data-chat-drag-handle
      title="끌어서 옮기기 · 두 번 눌러 원래 자리"
      className="flex h-14 shrink-0 items-center gap-1 border-b px-2 sm:cursor-grab sm:active:cursor-grabbing"
    >
      {onBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="뒤로">
          <ArrowLeft />
        </Button>
      )}
      <div className={onBack ? "min-w-0 flex-1" : "min-w-0 flex-1 pl-2"}>
        <h2 className="truncate font-medium">{title}</h2>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
      <Button variant="ghost" size="icon-sm" onClick={close} aria-label="채팅 창 닫기">
        <X />
      </Button>
    </div>
  );
}
