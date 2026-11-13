// 채팅 화면 표시 규칙 (features.md 8.3·8.5) - 채팅 기능 안에서만 쓴다.
import type { ChatMessage, ChatRoomDetail, ChatRoomMember, ChatRoomSummary, ChatUser } from "@/services/api/chats";
import { toKstParts } from "@/lib/format";

// 방 이름: 나만 보는 이름 → 기본 이름 → (1:1) 상대 이름 (2026-11-13 사용자 결정)
export function roomTitle(room: Pick<ChatRoomSummary | ChatRoomDetail, "myName" | "name" | "otherUser">) {
  return room.myName ?? room.name ?? room.otherUser?.name ?? "(이름 없음)";
}

// 직급 · 소속 (없는 값은 뺀다)
export function userMeta(user: Pick<ChatUser, "positionName" | "departmentName">) {
  return [user.positionName, user.departmentName].filter(Boolean).join(" · ");
}

// 목록 미리보기 한 줄
export function messagePreview(message: ChatMessage | null) {
  if (!message) return "";
  if (message.deleted) return "삭제된 메시지입니다";
  return message.content ?? "";
}

// 메시지별 안 읽은 사람 수 (카톡의 "1", features.md 8.5)
// 활성 참여자 중 그 메시지 이후에 참여했던 사람이 아니고(joinedAt <= 메시지 시각), 아직 거기까지 읽지 않은 사람 수.
// 보낸 사람은 보낼 때 읽음 처리되므로 자연히 빠진다. 시스템·삭제 메시지에는 표시하지 않는다.
export function unreadReaders(message: ChatMessage, members: ChatRoomMember[]) {
  if (message.type === "SYSTEM" || message.deleted) return 0;
  const sentAt = new Date(message.createdAt).getTime();
  return members.filter(
    (m) => new Date(m.joinedAt).getTime() <= sentAt && (m.lastReadMessageId ?? 0) < message.id,
  ).length;
}

// 메시지 시각 HH:mm, 날짜 구분선 yyyy-MM-dd (KST)
export function messageTime(value: string) {
  return toKstParts(value).time;
}

export function messageDate(value: string) {
  return toKstParts(value).date;
}

// 배지 숫자 (100 이상은 99+)
export function badgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
