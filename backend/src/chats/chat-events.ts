import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { ChatEvent, userRoom } from './const/chat.const';
import type { ChatMessageView } from './chat-view';

//! 서버 → 클라이언트 푸시
// - 서비스가 커밋 후 호출하고, 받는 사람(활성 참여자)도 호출하는 쪽이 정해 넘긴다.
// - 실패해도 로그만 남긴다. 화면은 재연결·새로고침 때 REST로 다시 받는다.
// - 소켓 서버는 ChatsGateway가 afterInit에서 넣어 줘서 서비스는 Gateway를 모른다.
@Injectable()
export class ChatEvents {

    private readonly logger = new Logger( ChatEvents.name );
    private server: Namespace | null = null;

    attach( server: Namespace ){
        this.server = server;
    }

    messageCreated( userIds: number[], message: ChatMessageView ){
        this.emit( userIds, ChatEvent.MESSAGE_CREATED, message );
    }

    messageUpdated( userIds: number[], message: ChatMessageView ){
        this.emit( userIds, ChatEvent.MESSAGE_UPDATED, message );
    }

    messageDeleted( userIds: number[], roomId: number, messageId: number ){
        this.emit( userIds, ChatEvent.MESSAGE_DELETED, { roomId, messageId } );
    }

    roomRead( userIds: number[], roomId: number, userId: number, lastReadMessageId: number ){
        this.emit( userIds, ChatEvent.ROOM_READ, { roomId, userId, lastReadMessageId } );
    }

    roomUpdated( userIds: number[], roomId: number ){
        this.emit( userIds, ChatEvent.ROOM_UPDATED, { roomId } );
    }

    roomRemoved( userIds: number[], roomId: number ){
        this.emit( userIds, ChatEvent.ROOM_REMOVED, { roomId } );
    }

    // room 여러 개에 한 번에 보낸다 (한 소켓이 여러 room에 있어도 한 번만 받는다)
    private emit( userIds: number[], event: string, payload: unknown ){
        if ( !this.server || userIds.length === 0 ) return;

        try {
            this.server.to( [ ...new Set( userIds ) ].map( userRoom ) ).emit( event, payload );
        } catch ( e ) {
            this.logger.error( `채팅 푸시 실패: ${event} (업무는 완료됨)`, e instanceof Error ? e.stack : String( e ) );
        }
    }
}
