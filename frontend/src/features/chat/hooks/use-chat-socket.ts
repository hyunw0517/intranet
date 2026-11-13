"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { refreshAccessToken } from "@/services/api-client";
import { createChatSocket } from "@/services/chat-socket";
import { addMessageToCache, chatKeys, patchMessageInCache, patchReadInCache } from "./use-chats";

const MAX_RETRY = 3;

// 채팅 소켓 연결 1개를 로그인 동안 유지하고, 서버 푸시를 TanStack Query 캐시에 반영한다.
// - 받기만 한다. 보내기·수정·삭제·읽음은 REST (features.md 8.1)
// - 새 메시지·수정·삭제는 열어 둔 대화의 캐시를 직접 고치고, 목록·안 읽은 수는 서버 값으로 다시 받는다(무효화).
//   목록의 순서·안 읽은 수 계산(내가 보낸 것·시스템 메시지 제외 등)을 화면에서 따라 하지 않기 위해서다.
//
// 연결이 끊기는 경우
// - 서버가 끊음(io server disconnect): access token 만료 시각에 서버가 끊는다(features.md 8.2) → 재발급 후 다시 연결
// - 인증 실패(connect_error, active=false): 토큰이 만료·무효 → 재발급 후 다시 연결 (연속 3번 실패하면 멈춤)
// - 네트워크 문제: socket.io가 스스로 다시 연결한다. auth가 함수라 그때의 최신 토큰을 쓴다.
// 다시 연결되면 끊긴 동안 놓친 푸시가 있을 수 있으므로 채팅 캐시를 모두 새로 받는다.
export function useChatSocket({
  enabled,
  userId,
  onRoomRemoved,
}: {
  enabled: boolean;
  userId: number | null;
  onRoomRemoved: (roomId: number) => void;
}) {
  const queryClient = useQueryClient();
  // 콜백이 바뀔 때마다 다시 연결하지 않도록 ref로 최신 값만 읽는다.
  const onRoomRemovedRef = useRef(onRoomRemoved);
  useEffect(() => {
    onRoomRemovedRef.current = onRoomRemoved;
  }, [onRoomRemoved]);

  useEffect(() => {
    if (!enabled || userId === null) return;

    const socket = createChatSocket();
    let disposed = false;
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const reconnectWithFreshToken = () => {
      if (retries >= MAX_RETRY) return;
      retries += 1;
      retryTimer = setTimeout(async () => {
        const token = await refreshAccessToken();
        // 재발급 실패 = 로그인 만료. 다음 REST 요청이 로그아웃 처리를 하므로 여기서는 멈춘다.
        if (!token || disposed) return;
        socket.connect();
      }, 1000 * retries);
    };

    const refreshRoomLists = () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() });
      void queryClient.invalidateQueries({ queryKey: chatKeys.unreadTotal() });
    };

    socket.on("connect", () => {
      retries = 0;
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
    });
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") reconnectWithFreshToken();
    });
    socket.on("connect_error", () => {
      if (!socket.active) reconnectWithFreshToken();
    });

    socket.on("message:created", (message) => {
      addMessageToCache(queryClient, message);
      refreshRoomLists();
      if (message.type === "FILE") void queryClient.invalidateQueries({ queryKey: chatKeys.files(message.roomId) }); // 파일 보관함
    });
    socket.on("message:updated", (message) => {
      patchMessageInCache(queryClient, message.roomId, message.id, () => message);
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }); // 목록 미리보기
    });
    socket.on("message:deleted", ({ roomId, messageId }) => {
      patchMessageInCache(queryClient, roomId, messageId, (m) => ({ ...m, deleted: true, content: null, files: [] }));
      refreshRoomLists();
      void queryClient.invalidateQueries({ queryKey: chatKeys.files(roomId) }); // 지운 파일 메시지면 보관함에서도 빠진다
    });
    socket.on("room:read", ({ roomId, userId: readerId, lastReadMessageId }) => {
      patchReadInCache(queryClient, roomId, readerId, lastReadMessageId);
      if (readerId === userId) refreshRoomLists(); // 내가 (다른 탭에서도) 읽음 → 배지 갱신
    });
    socket.on("room:updated", ({ roomId }) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.room(roomId) });
      refreshRoomLists();
    });
    socket.on("room:removed", ({ roomId }) => {
      queryClient.removeQueries({ queryKey: chatKeys.room(roomId) });
      queryClient.removeQueries({ queryKey: chatKeys.messages(roomId) });
      refreshRoomLists();
      onRoomRemovedRef.current(roomId);
    });

    socket.connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, userId, queryClient]);
}
