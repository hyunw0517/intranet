// 채팅 화면 표시 규칙 - 채팅 기능 안에서만 쓴다.
import type { ChatFileKind, ChatMessage, ChatRoomDetail, ChatRoomMember, ChatRoomSummary, ChatUser } from "@/services/api/chats";
import { toKstParts } from "@/lib/format";

// 방 이름: 나만 보는 이름 → 기본 이름 → (1:1) 상대 이름
export function roomTitle(room: Pick<ChatRoomSummary | ChatRoomDetail, "myName" | "name" | "otherUser">) {
  return room.myName ?? room.name ?? room.otherUser?.name ?? "(이름 없음)";
}

// 직급 · 소속 (없는 값은 뺀다)
export function userMeta(user: Pick<ChatUser, "positionName" | "departmentName">) {
  return [user.positionName, user.departmentName].filter(Boolean).join(" · ");
}

// 목록 미리보기 한 줄 → 문구 + 왼쪽 아이콘 종류 (아이콘은 화면이 회색 작은 크기로 그린다)
// 파일 메시지: 이미지(묶음 포함) "이미지", 동영상 "동영상", 그 밖의 파일은 "파일명.확장자"
export function messagePreview(message: ChatMessage | null): { icon: ChatFileKind | null; text: string } {
  if (!message) return { icon: null, text: "" };
  if (message.deleted) return { icon: null, text: "삭제된 메시지입니다" };
  if (message.type === "FILE") {
    const first = message.files[0];
    if (!first) return { icon: "file", text: "파일" };
    if (first.kind === "image") return { icon: "image", text: "이미지" };
    if (first.kind === "video") return { icon: "video", text: "동영상" };
    return { icon: "file", text: first.name };
  }
  return { icon: null, text: message.content ?? "" };
}

// 메시지별 안 읽은 사람 수
// 메시지 전에 참여해 있었고 아직 거기까지 읽지 않은 활성 참여자 수 (보낸 사람은 자연히 빠진다)
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

// 같은 사람이 같은 날 같은 분에 이어 보낸 메시지인지 (화면은 묶음의 마지막 메시지에만 시각을 쓴다)
// 보낸 사람을 알 수 없거나 사이에 시스템 메시지가 있으면 묶지 않는다.
export function sameMinuteGroup(a: ChatMessage, b: ChatMessage) {
  if (a.type === "SYSTEM" || b.type === "SYSTEM" || !a.sender || !b.sender || a.sender.id !== b.sender.id) return false;
  const pa = toKstParts(a.createdAt);
  const pb = toKstParts(b.createdAt);
  return pa.date === pb.date && pa.time === pb.time;
}

// 복사용 시각: 오전/오후 h:mm (KST)
export function messageTime12h(value: string) {
  const [hour, minute] = toKstParts(value).time.split(":");
  const h = Number(hour);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${minute}`;
}

export function messageDate(value: string) {
  return toKstParts(value).date;
}

// 복사용 날짜: yyyy-MM-dd → 2026년 11월 13일 금요일 (이미 KST 날짜라 UTC로 읽어 요일만 구한다)
export function copyDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = "일월화수목금토"[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}년 ${month}월 ${day}일 ${weekday}요일`;
}

// 배지 숫자 (100 이상은 99+)
export function badgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
