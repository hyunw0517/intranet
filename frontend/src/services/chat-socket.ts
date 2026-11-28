// 채팅 소켓 연결 (Socket.IO, namespace /chats) - 서버 푸시만 받는다
// - /api/socket.io로 접속하면 Next rewrite(운영은 Nginx)가 NestJS로 넘긴다.
// - handshake auth를 함수로 넘겨 재연결할 때마다 최신 access token을 읽는다.
// - 서버가 만료 시각에 끊으면 재연결 판단은 use-chat-socket 훅이 한다.
import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "@/services/api-client";
import type { ChatMessage } from "@/services/api/chats";

// 서버 → 클라이언트 이벤트 (백엔드 chat.const.ts의 ChatEvent)
export interface ChatServerEvents {
  "message:created": (message: ChatMessage) => void;
  "message:updated": (message: ChatMessage) => void;
  "message:deleted": (payload: { roomId: number; messageId: number }) => void;
  "room:read": (payload: { roomId: number; userId: number; lastReadMessageId: number }) => void;
  "room:updated": (payload: { roomId: number }) => void;
  "room:removed": (payload: { roomId: number }) => void;
}

export type ChatSocket = Socket<ChatServerEvents, Record<string, never>>;

export function createChatSocket(): ChatSocket {
  return io("/chats", {
    path: "/api/socket.io",
    // Next는 끝 슬래시가 붙은 주소(/api/socket.io/)를 308로 슬래시 없는 주소로 바꾼다.
    // 그래서 슬래시 없이 요청하고, next.config의 rewrite가 백엔드 주소(/socket.io/)에 슬래시를 붙인다.
    addTrailingSlash: false,
    auth: (cb) => cb({ token: getAccessToken() ?? "" }),
    autoConnect: false,
  });
}
