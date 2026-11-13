import { ChatMessageType, Prisma } from 'src/generated/prisma/client';

//! 채팅 응답 형태 (REST 응답과 소켓 푸시가 같은 형태를 쓴다)
// 소켓 emit은 인터셉터·직렬화를 거치지 않으므로, 내보낼 필드는 select와 이 파일의 변환 함수로만 정한다.

//* 화면에 보여줄 회원 정보 (이름·직급·대표 소속)
export const chatUserSelect = {
    id: true,
    name: true,
    status: true,
    deleted: true,
    position: { select: { name: true } },
    departments: { where: { isPrimary: true }, select: { department: { select: { name: true } } }, take: 1 },
} satisfies Prisma.UsersSelect;

type ChatUserRow = Prisma.UsersGetPayload<{ select: typeof chatUserSelect }>;

export interface ChatUserView {
    id: number;
    name: string;
    positionName: string | null;
    departmentName: string | null;
    active: boolean;            // ACTIVE이고 삭제되지 않음 (1:1 읽기 전용 판단, 화면 표시)
}

export function toChatUser( user: ChatUserRow ): ChatUserView {
    return {
        id: user.id,
        name: user.name,
        positionName: user.position?.name ?? null,
        departmentName: user.departments[0]?.department.name ?? null,
        active: user.status === 'ACTIVE' && !user.deleted,
    };
}

//* 메시지
export const chatMessageSelect = {
    id: true,
    chatRoomId: true,
    type: true,
    content: true,
    createdAt: true,
    editedAt: true,
    deleted: true,
    sender: { select: { id: true, name: true } },
} satisfies Prisma.ChatMessageSelect;

type ChatMessageRow = Prisma.ChatMessageGetPayload<{ select: typeof chatMessageSelect }>;

export interface ChatMessageView {
    id: number;
    roomId: number;
    type: ChatMessageType;
    content: string | null;     // 삭제된 메시지는 null (원문은 DB에만 남긴다)
    sender: { id: number; name: string } | null;
    createdAt: Date;
    editedAt: Date | null;      // 수정한 적 있으면 "수정됨" 표시
    deleted: boolean;
}

export function toChatMessage( message: ChatMessageRow ): ChatMessageView {
    return {
        id: message.id,
        roomId: message.chatRoomId,
        type: message.type,
        content: message.deleted ? null : message.content,
        sender: message.sender,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        deleted: message.deleted,
    };
}
