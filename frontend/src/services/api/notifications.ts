// 백엔드 common/notifications.controller 대응 (/common/notifications/*)
// 모두 본인 알림만 다룬다(다른 사람 알림 id는 404). 승인 전(GUEST)은 호출할 수 없다(@Roles(USER) → 403).
// 알림 생성 API는 없다. 업무 서비스(가입·댓글·공지 등)가 서버에서 만든다.
import { apiFetch } from "@/services/api-client";
import type { CursorResult } from "@/types/pagination";

export type NotificationActionType =
  | "SYSTEM"
  | "SIGNUP_REQUESTED"
  | "SIGNUP_APPROVED"
  | "NOTICE_CREATED"
  | "POST_COMMENTED"
  | "COMMENT_REPLIED"
  | "POST_DELETED_BY_ADMIN"
  | "COMMENT_DELETED_BY_ADMIN"
  | "SESSION_REVOKED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "RESERVATION_CANCELLED"
  | "CHAT_MESSAGE";

// GET /common/notifications 의 한 행 (id는 BigInt라 문자열로 온다)
export interface NotificationItem {
  id: string;
  actionType: NotificationActionType;
  targetType: string | null;
  targetId: number | null;
  title: string;
  content: string | null;
  link: string | null; // 눌렀을 때 이동할 화면 (서버가 저장한 프론트 주소)
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  sender: { id: number; name: string } | null; // 시스템·익명·관리자 삭제 알림은 null
}

// 최신순 커서 페이지네이션 (cursor = 직전 응답의 meta.nextCursor)
export function fetchNotifications(query: { cursor?: string; take?: number; unreadOnly?: boolean } = {}) {
  const params = new URLSearchParams();
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.take) params.set("take", String(query.take));
  if (query.unreadOnly) params.set("unreadOnly", "true");
  const qs = params.toString();
  return apiFetch<CursorResult<NotificationItem>>(`/common/notifications${qs ? `?${qs}` : ""}`);
}

export function fetchUnreadCount() {
  return apiFetch<{ count: number }>("/common/notifications/unread-count");
}

// 이미 읽은 알림이면 그대로 둔다(204)
export function markNotificationRead(id: string) {
  return apiFetch<void>(`/common/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ count: number }>("/common/notifications/read-all", { method: "PATCH" });
}

export function deleteNotification(id: string) {
  return apiFetch<void>(`/common/notifications/${id}`, { method: "DELETE" });
}

// 읽은 알림만 지운다. (안 읽은 알림은 남는다)
export function deleteReadNotifications() {
  return apiFetch<{ count: number }>("/common/notifications/read", { method: "DELETE" });
}
