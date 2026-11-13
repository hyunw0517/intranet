"use client";

import { useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import {
  fetchChatMessages,
  fetchChatRoom,
  fetchChatRooms,
  fetchChatUnreadTotal,
  searchChatUsers,
  type ChatMessage,
  type ChatRoomDetail,
} from "@/services/api/chats";
import type { CursorResult } from "@/types/pagination";

// 채팅 queryKey - 모두 "chats" 접두사라 다시 연결할 때 한 번에 새로 받을 수 있다.
export const chatKeys = {
  all: ["chats"] as const,
  rooms: () => [...chatKeys.all, "rooms"] as const,
  unreadTotal: () => [...chatKeys.all, "unread-total"] as const,
  room: (roomId: number) => [...chatKeys.all, "room", roomId] as const,
  messages: (roomId: number) => [...chatKeys.all, "messages", roomId] as const,
  users: (search: string) => [...chatKeys.all, "users", search] as const,
};

// 헤더 배지: 전체 안 읽은 수
// - 실시간 갱신은 소켓 이벤트가 이 키를 무효화해서 한다(use-chat-socket). 소켓이 끊긴 동안을 대비해 창으로 돌아올 때도 다시 받는다.
export function useChatUnreadTotal(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.unreadTotal(),
    queryFn: fetchChatUnreadTotal,
    enabled,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

// 내 채팅방 목록 (최근 메시지 순, 방별 안 읽은 수)
export function useChatRooms(enabled: boolean) {
  return useQuery({ queryKey: chatKeys.rooms(), queryFn: fetchChatRooms, enabled });
}

// 방 상세 (참여자별 lastReadMessageId → 메시지별 안 읽은 사람 수)
export function useChatRoom(roomId: number) {
  return useQuery({ queryKey: chatKeys.room(roomId), queryFn: () => fetchChatRoom(roomId) });
}

const MESSAGE_PAGE_SIZE = 30;

// 메시지 (최신순 커서 페이지네이션, [이전 메시지]로 이어 받기)
// - 캐시는 서버 순서 그대로(페이지마다 id 내림차순) 두고, 화면이 뒤집어 오래된 것부터 그린다.
// - 새 메시지·수정·삭제는 소켓 이벤트로 캐시를 직접 고친다(아래 함수들). 다시 받으면 대화가 깜빡이고 스크롤이 튄다.
export function useChatMessages(roomId: number) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(roomId),
    queryFn: ({ pageParam }) => fetchChatMessages(roomId, { cursor: pageParam, take: MESSAGE_PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    staleTime: Infinity, // 소켓이 최신으로 유지한다. 다시 연결되면 chatKeys.all 무효화로 새로 받는다.
  });
}

// 채팅 상대 검색 (새 채팅·초대)
export function useChatUserSearch(search: string) {
  return useQuery({ queryKey: chatKeys.users(search), queryFn: () => searchChatUsers(search) });
}

// ── 메시지 캐시 직접 수정 (소켓 이벤트·보내기 응답) ──────────────────

type MessagePages = InfiniteData<CursorResult<ChatMessage>, string | undefined>;

// 새 메시지를 맨 앞(최신)에 넣는다. 보내기 응답과 소켓 푸시가 둘 다 오므로 이미 있으면 넣지 않는다.
// 아직 그 방을 연 적이 없어 캐시가 없으면 아무것도 하지 않는다(열 때 처음부터 받는다).
export function addMessageToCache(queryClient: QueryClient, message: ChatMessage) {
  queryClient.setQueryData<MessagePages>(chatKeys.messages(message.roomId), (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((page) => page.data.some((m) => m.id === message.id))) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
  });
}

// 수정·삭제된 메시지를 제자리에서 바꾼다.
export function patchMessageInCache(
  queryClient: QueryClient,
  roomId: number,
  messageId: number,
  patch: (message: ChatMessage) => ChatMessage,
) {
  queryClient.setQueryData<MessagePages>(chatKeys.messages(roomId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        data: page.data.map((m) => (m.id === messageId ? patch(m) : m)),
      })),
    };
  });
}

// 누가 어디까지 읽었는지 (room:read) → 방 상세의 참여자 값만 바꾼다. 값은 앞으로만 움직인다.
export function patchReadInCache(queryClient: QueryClient, roomId: number, userId: number, lastReadMessageId: number) {
  queryClient.setQueryData<ChatRoomDetail>(chatKeys.room(roomId), (room) => {
    if (!room) return room;
    return {
      ...room,
      members: room.members.map((m) =>
        m.id === userId && (m.lastReadMessageId ?? 0) < lastReadMessageId ? { ...m, lastReadMessageId } : m,
      ),
    };
  });
}
