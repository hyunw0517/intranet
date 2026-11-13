import { extname } from 'path';
import { IMAGE_MIME_BY_EXT, VIDEO_EXTENSIONS } from 'src/common/const/file.const';
import type { FileInfo } from 'src/common/files.service';
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

//* 파일 메시지의 파일 (features.md 8.4)
// 종류는 확장자로 나눈다. 이미지 미리보기는 썸네일 API를 불러 보고, 없으면(가짜·깨진 파일) 화면이 엑스박스를 그린다.
export type ChatFileKind = 'image' | 'video' | 'file';

export interface ChatFileView {
    id: number;
    name: string;               // 원본 파일명
    size: number;
    kind: ChatFileKind;
}

export function chatFileKind( name: string ): ChatFileKind {
    const ext = extname( name ).toLowerCase();
    if ( IMAGE_MIME_BY_EXT[ ext ] ) return 'image';
    if ( VIDEO_EXTENSIONS.includes( ext ) ) return 'video';
    return 'file';
}

export interface ChatMessageView {
    id: number;
    roomId: number;
    type: ChatMessageType;
    content: string | null;     // 삭제된 메시지는 null (원문은 DB에만 남긴다)
    files: ChatFileView[];      // FILE 메시지의 파일 (순서대로, 이미지 묶음은 여러 개). 삭제된 메시지는 []
    sender: { id: number; name: string } | null;
    createdAt: Date;
    editedAt: Date | null;      // 수정한 적 있으면 "수정됨" 표시
    deleted: boolean;
}

export function toChatMessage( message: ChatMessageRow, files: FileInfo[] = [] ): ChatMessageView {
    return {
        id: message.id,
        roomId: message.chatRoomId,
        type: message.type,
        content: message.deleted ? null : message.content,
        files: message.deleted ? [] : files.map( ( f ) => ({ id: f.id, name: f.originalName, size: f.size, kind: chatFileKind( f.originalName ) }) ),
        sender: message.sender,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        deleted: message.deleted,
    };
}
