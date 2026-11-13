//! 채팅 규칙 값 (features.md 8장, 2026-11-13 사용자 결정)

export const CHAT_GROUP_MIN_MEMBERS = 3;          // 그룹 생성 시 본인 포함 최소 인원 (이후 2명만 남아도 그룹 유지)
export const CHAT_GROUP_NAME_MAX_LENGTH = 50;     // 그룹 이름 최대 길이
export const CHAT_INVITE_MAX = 100;               // 한 번에 초대할 수 있는 인원
export const CHAT_MESSAGE_MAX_LENGTH = 2000;      // 메시지 최대 길이
export const CHAT_EDIT_LIMIT_MS = 5 * 60 * 1000;  // 수정·삭제 가능 시간: 보낸 뒤 5분

//* 소켓 room 이름 - 회원마다 하나 (채팅방 room은 두지 않는다, features.md 8.1)
export const userRoom = ( userId: number ) => `user:${userId}`;

//* 1:1 방 중복 방지 키 - 작은 id가 앞 ("3:17")
export const directKeyOf = ( a: number, b: number ) => a < b ? `${a}:${b}` : `${b}:${a}`;

//* 서버 → 클라이언트 소켓 이벤트 이름 (features.md 8.2)
export const ChatEvent = {
    MESSAGE_CREATED: 'message:created',
    MESSAGE_UPDATED: 'message:updated',
    MESSAGE_DELETED: 'message:deleted',
    ROOM_READ: 'room:read',
    ROOM_UPDATED: 'room:updated',
    ROOM_REMOVED: 'room:removed',
} as const;

//* 감사 로그 detail.action (UPDATE 행에서 무슨 변경인지 구분)
export const ChatAuditAction = {
    INVITE: 'INVITE',
    KICK: 'KICK',
    LEAVE: 'LEAVE',
} as const;
