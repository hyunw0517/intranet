// 채팅 소켓 연결 (Socket.IO, namespace /chats) - 서버 → 클라이언트 푸시만 받는다. 보내는 소켓 이벤트는 없다.
// - 브라우저 → /api/socket.io → (Next rewrite, 운영은 Nginx) → NestJS /socket.io/
// - handshake auth에 access token(메모리)을 넣는다. auth를 함수로 넘겨 재연결할 때마다 최신 토큰을 읽는다.
// - 서버는 access token 만료 시각에 연결을 끊는다(features.md 8.2). 재연결 판단은 use-chat-socket 훅이 한다.
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
