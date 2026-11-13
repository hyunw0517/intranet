import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from 'src/auth/auth.service';
import { UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatEvents } from './chat-events';
import { userRoom } from './const/chat.const';

//* 소켓에 저장하는 값 (handshake 인증 결과)
interface ChatSocketData {
    userId: number;
    expiresAt: number;                  // access token 만료 시각 (ms)
    expiryTimer?: ReturnType<typeof setTimeout>;
}

type ChatSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, ChatSocketData>;

//! 채팅 소켓 연결 (features.md 8.2)
// - 클라이언트 → 서버 이벤트는 받지 않는다(@SubscribeMessage 없음). 보내기·수정·삭제·읽음은 전부 REST.
//   → HTTP 가드·ValidationPipe·예외 필터·트랜잭션·감사 로그를 소켓용으로 다시 만들 필요가 없다.
// - 하는 일은 셋뿐: ① handshake 인증 ② user room에 넣기 ③ access token 만료 시각에 연결 끊기
// - 같은 출처로 접속하므로(Next rewrite·Nginx의 /api/socket.io → /socket.io) CORS 설정이 필요 없다.
@WebSocketGateway({ namespace: 'chats' })
export class ChatsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    private readonly logger = new Logger( ChatsGateway.name );

    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
        private readonly chatEvents: ChatEvents,
    ){}

    //* ① handshake 인증 - 연결 전에 실행되는 socket.io 미들웨어
    // HTTP 가드는 소켓에 적용되지 않으므로 여기서 직접 검사한다.
    // HTTP의 access 검증(stateless)과 달리 DB를 한 번 본다: 연결은 오래 유지되므로 연결 시점에 tokenVersion·상태를 확인한다.
    // 실패하면 next(error) → 클라이언트 connect_error에 메시지가 전달된다. (토큰 만료면 재발급 후 다시 연결)
    afterInit( server: Namespace ){
        this.chatEvents.attach( server );

        server.use( ( socket: ChatSocket, next ) => {
            void this.authenticate( socket )
                .then( () => next() )
                .catch( ( e: unknown ) => next( e instanceof Error ? e : new Error( '인증에 실패했습니다.' ) ) );
        });
    }

    //* ② user room에 넣기 + ③ 만료 타이머
    // access token 만료 시각에 서버가 연결을 끊는다. → 권한 변경·퇴사·로그아웃이 REST와 같이 최대 10분 안에 반영된다.
    // 핵심(auth·users)이 채팅 소켓을 끊으러 호출할 필요가 없다. (핵심 → 애드온 의존 금지, R-ARCH-01)
    // 클라이언트는 disconnect 이유가 'io server disconnect'면 최신 토큰으로 다시 connect() 한다.
    async handleConnection( socket: ChatSocket ){
        const { userId, expiresAt } = socket.data;

        await socket.join( userRoom( userId ) );

        socket.data.expiryTimer = setTimeout( () => socket.disconnect( true ), Math.max( 0, expiresAt - Date.now() ) );
    }

    handleDisconnect( socket: ChatSocket ){
        if ( socket.data.expiryTimer ) clearTimeout( socket.data.expiryTimer );
    }

    // 토큰(서명·만료·type) → 회원(삭제 안 됨·tokenVersion·ACTIVE·USER 이상)
    private async authenticate( socket: ChatSocket ){
        const token: unknown = socket.handshake.auth?.token;

        if ( typeof token !== 'string' || token === '' ) {
            throw new Error( '토큰이 없습니다.' );
        }

        const payload = this.authService.verifyToken( token ); // 서명·만료 (실패 시 UnauthorizedException)

        if ( payload.type !== 'access' ) {
            throw new Error( 'Access Token이 아닙니다.' );
        }

        const user = await this.prisma.users.findFirst({
            where: { id: payload.sub, deleted: false },
            select: { id: true, role: true, status: true, tokenVersion: true },
        });

        if ( !user || user.tokenVersion !== payload.ver ) {
            throw new Error( '만료된 로그인 정보입니다. 다시 로그인해 주세요.' );
        }

        if ( user.status !== UserStatus.ACTIVE || user.role === UserRole.GUEST ) {
            throw new Error( '채팅을 사용할 수 없는 계정입니다.' );
        }

        socket.data.userId = user.id;
        socket.data.expiresAt = payload.exp * 1000;

        this.logger.debug( `채팅 연결: user ${user.id}` );
    }
}
