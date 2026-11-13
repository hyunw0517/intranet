"use client";

import { useState } from "react";
import { SquarePen, Users } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/common/data-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatListDate } from "@/lib/format";
import type { ChatRoomSummary } from "@/services/api/chats";
import { badgeCount, messagePreview, roomTitle } from "../chat-display";
import { useChatRooms } from "../hooks/use-chats";
import { ChatPanelHeader } from "./chat-window";
import { useChat } from "./chat-provider";

// 내 채팅방 목록 (최근 메시지 순) - 소켓 푸시마다 서버 값으로 다시 받는다(use-chat-socket)
// 방 열기는 더블 클릭 (2026-11-13 사용자 결정) - 한 번 누르면 선택 표시만, 키보드는 Enter로 연다.
export function ChatRoomList() {
  const { showNew, openRoom } = useChat();
  const { data, isPending, isError, error, refetch } = useChatRooms(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <>
      <ChatPanelHeader
        title="채팅"
        actions={
          <Button variant="ghost" size="icon-sm" onClick={showNew} aria-label="새 채팅">
            <SquarePen />
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : data.length === 0 ? (
          <div className="grid justify-items-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground">
            <p>참여 중인 채팅방이 없습니다.</p>
            <Button variant="outline" size="sm" onClick={showNew}>
              <SquarePen aria-hidden />새 채팅
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {data.map((room) => (
              <ChatRoomRow
                key={room.id}
                room={room}
                selected={selectedId === room.id}
                onSelect={() => setSelectedId(room.id)}
                onOpen={() => openRoom(room.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// 한 줄: [첫 글자] 방 이름 (그룹 인원) · 시각 / 마지막 메시지 · [안 읽은 수]
// - 버튼은 Enter·Space를 누르면 click이 나므로, Enter는 keydown에서 먼저 받아 열고 click(선택)은 막는다.
// - touch-manipulation: 모바일에서 두 번 탭이 화면 확대가 아니라 더블 클릭으로 처리되게 한다.
function ChatRoomRow({
  room,
  selected,
  onSelect,
  onOpen,
}: {
  room: ChatRoomSummary;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const title = roomTitle(room);
  const isGroup = room.type === "GROUP";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-pressed={selected}
        title="두 번 눌러 열기"
        className={cn(
          "flex w-full touch-manipulation items-center gap-3 px-4 py-3 text-left outline-none select-none hover:bg-muted/50 focus-visible:bg-muted/50",
          selected && "bg-muted hover:bg-muted",
        )}
      >
        <Avatar className="size-9">
          <AvatarFallback className="text-sm">{isGroup ? <Users className="size-4" aria-hidden /> : title.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={cn("truncate text-sm", room.unreadCount > 0 && "font-medium")}>{title}</span>
            {isGroup && <span className="shrink-0 text-xs text-muted-foreground">{room.memberCount}</span>}
            {room.lastMessageAt && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatListDate(room.lastMessageAt)}</span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className="truncate text-sm text-muted-foreground">{messagePreview(room.lastMessage) || " "}</span>
            {room.unreadCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-white tabular-nums">
                <span className="sr-only">읽지 않은 메시지 </span>
                {badgeCount(room.unreadCount)}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
