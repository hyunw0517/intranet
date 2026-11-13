// 백엔드 chats/chat-rooms.controller · chat-messages.controller 대응 (/chats/*)
// - 모두 USER 이상(GUEST 403), 내가 참여한 방만 다룬다(아니면 404). 채팅 애드온이 꺼져 있으면 API 자체가 없다(404).
// - 보내기·수정·삭제·방 관리는 이 REST로만 한다. 실시간 받기는 소켓(services/chat-socket.ts)이 서버 푸시만 받는다.
import { apiFetch, apiFetchBlob, apiUpload } from "@/services/api-client";
import { MAX_ATTACHMENT_SIZE, MAX_IMAGE_SIZE } from "@/services/api/files";
import type { CursorResult } from "@/types/pagination";

export type ChatRoomType = "DIRECT" | "GROUP";
export type ChatRoomMemberRole = "OWNER" | "MEMBER";
export type ChatMessageType = "TEXT" | "SYSTEM" | "FILE";

// 화면에 보여줄 회원 (백엔드 ChatUserView)
export interface ChatUser {
  id: number;
  name: string;
  positionName: string | null;
  departmentName: string | null;
  active: boolean; // 재직(ACTIVE)이고 삭제되지 않음. 1:1 상대가 false면 읽기 전용
}

// 파일 메시지의 파일 (백엔드 ChatFileView, 종류는 확장자 기준)
// 이미지는 썸네일 API로 미리보기를 받아 보고, 없으면(가짜·깨진 파일) 엑스박스를 그린다.
export type ChatFileKind = "image" | "video" | "file";

export interface ChatFile {
  id: number;
  name: string;
  size: number;
  kind: ChatFileKind;
}

// 메시지 (REST 응답과 소켓 푸시가 같은 형태)
export interface ChatMessage {
  id: number;
  roomId: number;
  type: ChatMessageType;
  content: string | null; // 삭제된 메시지는 null
  files: ChatFile[]; // FILE 메시지의 파일 (이미지 묶음은 여러 개, 삭제된 메시지는 [])
  sender: { id: number; name: string } | null;
  createdAt: string;
  editedAt: string | null; // 있으면 "수정됨"
  deleted: boolean;
}

// GET /chats 의 한 행 (최근 메시지 순)
export interface ChatRoomSummary {
  id: number;
  type: ChatRoomType;
  name: string | null; // 방 기본 이름 (그룹)
  myName: string | null; // 나만 보는 이름
  otherUser: ChatUser | null; // 1:1 상대 (그룹은 null)
  memberCount: number;
  myRole: ChatRoomMemberRole;
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

// GET /chats/:roomId - 참여자별 lastReadMessageId·joinedAt으로 메시지별 안 읽은 사람 수를 화면이 계산한다.
export interface ChatRoomMember extends ChatUser {
  role: ChatRoomMemberRole;
  joinedAt: string;
  lastReadMessageId: number | null;
}

export interface ChatRoomDetail {
  id: number;
  type: ChatRoomType;
  name: string | null;
  myName: string | null;
  myRole: ChatRoomMemberRole;
  otherUser: ChatUser | null;
  readOnly: boolean; // 1:1 상대가 퇴사·비활성·삭제 → 보내기 불가
  members: ChatRoomMember[]; // 활성 참여자 (참여 순)
}

// ── 방 ──────────────────────────────────────────────────────────

export function fetchChatRooms() {
  return apiFetch<ChatRoomSummary[]>("/chats");
}

// 헤더 배지: 전체 안 읽은 수
export function fetchChatUnreadTotal() {
  return apiFetch<{ total: number }>("/chats/unread-count");
}

// 채팅 상대 검색 (본인 제외, 이름·사번·부서명, 최대 20명)
export function searchChatUsers(search: string) {
  return apiFetch<ChatUser[]>("/chats/users", { query: { search: search || undefined } });
}

export function fetchChatRoom(roomId: number) {
  return apiFetch<ChatRoomDetail>(`/chats/${roomId}`);
}

// 1:1 열기 (있으면 그 방, 없으면 생성) → 방 상세
export function openDirectChat(userId: number) {
  return apiFetch<ChatRoomDetail>("/chats/direct", { method: "POST", body: { userId } });
}

// 그룹 생성 (본인 포함 3명 이상) → 방 상세
// name을 생략하면 서버가 참여자 이름으로 만든다: 영문 → 한글 가나다순, 3명까지 쉼표, 넘으면 "외 N명" (2026-11-13 사용자 결정)
export function createGroupChat(input: { name?: string; userIds: number[] }) {
  return apiFetch<ChatRoomDetail>("/chats/group", { method: "POST", body: input });
}

// 방 기본 이름 변경 (그룹, OWNER만)
export function renameChatRoom(roomId: number, name: string) {
  return apiFetch<ChatRoomDetail>(`/chats/${roomId}/name`, { method: "PATCH", body: { name } });
}

// 나만 보는 이름 (null이면 기본 이름으로)
export function setMyChatRoomName(roomId: number, name: string | null) {
  return apiFetch<{ myName: string | null }>(`/chats/${roomId}/my-name`, { method: "PATCH", body: { name } });
}

// 초대 (그룹, 참여자 누구나)
export function inviteChatMembers(roomId: number, userIds: number[]) {
  return apiFetch<ChatRoomDetail>(`/chats/${roomId}/members`, { method: "POST", body: { userIds } });
}

// 내보내기 (그룹, OWNER만)
export function kickChatMember(roomId: number, userId: number) {
  return apiFetch<boolean>(`/chats/${roomId}/members/${userId}`, { method: "DELETE" });
}

// 나가기 (1:1은 숨기기, 그룹 OWNER는 nextOwnerId 지정 가능 - 생략하면 가장 오래 참여한 사람)
export function leaveChatRoom(roomId: number, nextOwnerId?: number) {
  return apiFetch<boolean>(`/chats/${roomId}/leave`, { method: "POST", body: nextOwnerId ? { nextOwnerId } : {} });
}

// 여기까지 읽음 (값은 앞으로만 움직인다)
export function markChatRead(roomId: number, messageId: number) {
  return apiFetch<{ lastReadMessageId: number | null }>(`/chats/${roomId}/read`, { method: "POST", body: { messageId } });
}

// ── 메시지 ──────────────────────────────────────────────────────

// 최신순 커서 페이지네이션 (cursor = 직전 응답의 meta.nextCursor)
export function fetchChatMessages(roomId: number, query: { cursor?: string; take?: number } = {}) {
  return apiFetch<CursorResult<ChatMessage>>(`/chats/${roomId}/messages`, { query });
}

export function sendChatMessage(roomId: number, content: string) {
  return apiFetch<ChatMessage>(`/chats/${roomId}/messages`, { method: "POST", body: { content } });
}

// 수정: 본인 TEXT 메시지만 · 삭제: 본인 TEXT·FILE 메시지 (둘 다 보낸 뒤 5분 이내, 서버 시각 기준)
export function updateChatMessage(roomId: number, messageId: number, content: string) {
  return apiFetch<ChatMessage>(`/chats/${roomId}/messages/${messageId}`, { method: "PATCH", body: { content } });
}

export function deleteChatMessage(roomId: number, messageId: number) {
  return apiFetch<boolean>(`/chats/${roomId}/messages/${messageId}`, { method: "DELETE" });
}

// ── 파일 (백엔드 chat-files.controller) ─────────────────────────

// 보내기: 요청 1개 = 메시지 1개. 서버는 용량 한도를 경로별로 건다.
// - 이미지(1~10장, 장당 20MB) → POST /chats/:roomId/images (묶음 메시지)
// - 동영상·그 밖의 파일(1개, 200MB) → POST /chats/:roomId/files
// onProgress: 이 요청에서 지금까지 보낸 바이트 수 (화면이 "3/7" 계산에 쓴다)
export function sendChatImages(roomId: number, images: File[], onProgress?: (loaded: number) => void) {
  return upload(`/chats/${roomId}/images`, images, onProgress);
}

export function sendChatFile(roomId: number, file: File, onProgress?: (loaded: number) => void) {
  return upload(`/chats/${roomId}/files`, [file], onProgress);
}

function upload(path: string, files: File[], onProgress?: (loaded: number) => void) {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  return apiUpload<ChatMessage>(path, form, onProgress);
}

// 파일 보관함의 한 칸 (백엔드 listFiles) - 이미지 묶음은 파일마다 한 칸
export interface ChatRoomFile extends ChatFile {
  messageId: number;
  createdAt: string; // 보낸 시각 (메시지 기준)
  senderName: string | null;
}

// 파일 보관함: 이 방에서 주고받은 파일 (최신순 커서, 참여 시점 이후·삭제되지 않은 것만)
export function fetchChatRoomFiles(roomId: number, query: { cursor?: string; take?: number } = {}) {
  return apiFetch<CursorResult<ChatRoomFile>>(`/chats/${roomId}/files`, { query });
}

// 다운로드·미리보기: Bearer 헤더가 필요해 <a href>·<img src>를 바로 쓸 수 없다 → Blob으로 받는다
export function fetchChatFile(roomId: number, fileId: number) {
  return apiFetchBlob(`/chats/${roomId}/files/${fileId}`);
}

export function fetchChatThumbnail(roomId: number, fileId: number) {
  return apiFetchBlob(`/chats/${roomId}/files/${fileId}/thumbnail`);
}

// 백엔드 chat.const.ts·file.const.ts와 같은 값 (화면에서 미리 막는 용도, 최종 판단은 서버)
export const CHAT_FILES_PER_SEND = 10;
export const CHAT_FILE_MAX_SIZE = MAX_ATTACHMENT_SIZE; // 동영상·그 밖의 파일: 게시판 첨부와 같은 값 (파일당)
export const CHAT_IMAGE_MAX_SIZE = MAX_IMAGE_SIZE; // 이미지: 게시판 본문 이미지와 같은 값 (장당)
export const CHAT_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
export const CHAT_VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"];
export const CHAT_FILE_EXTENSIONS = [
  ".pdf", ".txt", ".csv", ".zip",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".hwp", ".hwpx",
  ...CHAT_IMAGE_EXTENSIONS,
  ...CHAT_VIDEO_EXTENSIONS,
];
export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_GROUP_NAME_MAX_LENGTH = 50;
export const CHAT_EDIT_LIMIT_MS = 5 * 60 * 1000;
