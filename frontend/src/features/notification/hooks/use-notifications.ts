"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, fetchUnreadCount } from "@/services/api/notifications";

// 알림 queryKey (안 읽은 수·목록을 같은 접두사로 묶어 읽음·삭제 후 한 번에 무효화)
export const notificationKeys = {
  all: ["notifications"] as const,
  unreadCount: () => [...notificationKeys.all, "unread-count"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
};

// 안 읽은 알림 수 (헤더의 빨간 점)
// - 60초마다 + 창으로 돌아올 때 다시 조회한다. (실시간 Socket.IO는 1월 이후 선택 확장)
// - 승인 직후에는 access token이 아직 GUEST라 최대 10분 403이 날 수 있어 재시도하지 않고 조용히 둔다.
export function useUnreadNotificationCount(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    enabled,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

const PAGE_SIZE = 20;

// 알림 목록 (최신순, 커서 페이지네이션 - [더 보기]로 이어 받기)
// - 알림 창을 열 때만 조회하고(enabled), 열 때마다 새로 받도록 staleTime 0
export function useNotificationList(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(),
    queryFn: ({ pageParam }) => fetchNotifications({ cursor: pageParam, take: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
    enabled,
    staleTime: 0,
    retry: false,
  });
}

// 알림을 바꾸는 요청 공용 (읽음·모두 읽음·삭제·읽은 알림 삭제)
// 성공하면 안 읽은 수와 목록을 함께 갱신한다. 화면별 후처리(토스트 등)는 mutate 옵션으로 넘긴다.
export function useNotificationMutation<TVariables = void, TData = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
