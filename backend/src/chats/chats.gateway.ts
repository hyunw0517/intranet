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

//! 채팅 소켓 연결
// - 클라이언트 → 서버 이벤트는 받지 않는다. 보내기·수정·삭제·읽음은 전부 REST라서
//   가드·검증·트랜잭션·감사 로그를 소켓용으로 다시 만들 필요가 없다.
// - 하는 일은 ① handshake 인증 ② user room에 넣기 ③ access token 만료 시각에 연결 끊기
// - 같은 출처(/api/socket.io)로 접속해서 CORS 설정이 필요 없다.
@WebSocketGateway({ namespace: 'chats' })
export class ChatsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {

    private readonly logger = new Logger( ChatsGateway.name );

    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
        private readonly chatEvents: ChatEvents,
    ){}

    //* ① handshake 인증 - 연결 전에 실행되는 socket.io 미들웨어
    // HTTP 가드는 소켓에 적용되지 않아서 여기서 직접 검사한다.
    // 연결은 오래 유지되므로 REST와 달리 연결 시점에 DB로 tokenVersion·상태를 확인한다.
    // 실패하면 클라이언트 connect_error로 메시지가 간다.
    afterInit( server: Namespace ){
        this.chatEvents.attach( server );

        server.use( ( socket: ChatSocket, next ) => {
            void this.authenticate( socket )
                .then( () => next() )
                .catch( ( e: unknown ) => next( e instanceof Error ? e : new Error( '인증에 실패했습니다.' ) ) );
        });
    }

    //* ② user room에 넣기 + ③ 만료 타이머
    // 만료 시각에 끊어서 권한 변경·퇴사·로그아웃이 REST와 같이 최대 10분 안에 반영된다.
    // 그래서 핵심 모듈이 채팅 소켓을 끊으러 부를 필요가 없다.
    // 클라이언트는 이유가 io server disconnect면 최신 토큰으로 다시 연결한다.
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
