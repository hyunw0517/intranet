"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { useEnabledAddons } from "@/features/addon/hooks/use-addons";
import { useAuth } from "@/providers/auth-provider";
import { useChatSocket } from "../hooks/use-chat-socket";
import { ChatWindow } from "./chat-window";

// 창 안에서 보고 있는 화면
export type ChatView = { type: "list" } | { type: "new" } | { type: "room"; roomId: number };

interface ChatContextValue {
  enabled: boolean; // 채팅을 쓸 수 있는가 (로그인·USER 이상·애드온 켜짐)
  open: boolean;
  view: ChatView;
  toggle: () => void;
  close: () => void;
  showList: () => void;
  showNew: () => void;
  openRoom: (roomId: number) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// 채팅 전체 상태 (떠 있는 창 + 소켓 연결)
// - 루트(AppProviders)에 둔다. 페이지를 옮겨도, 직원 화면 ↔ 관리자 화면을 오가도 다시 만들어지지 않아
//   열린 방·입력 중인 글·소켓 연결이 그대로 남는다. (각 레이아웃에 두면 (main)·admin 사이를 옮길 때 사라진다)
// - 로그인 전·GUEST·채팅 애드온이 꺼져 있으면 아무것도 하지 않는다(소켓 연결도 없음).
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const canUse = !!user && user.role !== "GUEST";
  const addons = useEnabledAddons(canUse);
  const enabled = canUse && !!addons.data?.enabled.includes("chats");

  // 다른 회원으로 다시 로그인하면 창 상태를 처음으로 되돌린다.
  return (
    <ChatState key={user?.id ?? "guest"} enabled={enabled} userId={user?.id ?? null}>
      {children}
    </ChatState>
  );
}

function ChatState({ enabled, userId, children }: { enabled: boolean; userId: number | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ChatView>({ type: "list" });

  // 보고 있던 방에서 내보내지면 목록으로
  // (소켓 훅은 이 콜백을 ref로 읽으므로 view가 바뀌어도 다시 연결하지 않는다)
  const handleRoomRemoved = useCallback(
    (roomId: number) => {
      if (view.type !== "room" || view.roomId !== roomId) return;
      setView({ type: "list" });
      toast.info("채팅방에서 내보내졌습니다.");
    },
    [view],
  );

  useChatSocket({ enabled, userId, onRoomRemoved: handleRoomRemoved });

  // 창을 닫으면(× 또는 헤더 아이콘) 다음에 열 때 목록부터 보인다. 페이지 이동은 닫는 것이 아니라 보던 방이 유지된다.
  const value = useMemo<ChatContextValue>(() => {
    const close = () => {
      setOpen(false);
      setView({ type: "list" });
    };
    return {
      enabled,
      open,
      view,
      toggle: () => (open ? close() : setOpen(true)),
      close,
      showList: () => setView({ type: "list" }),
      showNew: () => setView({ type: "new" }),
      openRoom: (roomId) => {
        setView({ type: "room", roomId });
        setOpen(true);
      },
    };
  }, [enabled, open, view]);

  return (
    <ChatContext.Provider value={value}>
      {children}
      {enabled && open && <ChatWindow />}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat은 ChatProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
