import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { TokenUserPayload } from "src/auth/types/jwt-payload.type";

//! 요청 컨텍스트 (AsyncLocalStorage)
// - 서비스는 req를 모른다. 감사 로그에 필요한 작업자 id·IP·User-Agent를 서비스 인자로 넘기지 않도록,
//   요청마다 req를 저장해 두고 같은 요청 안의 비동기 흐름(await 포함)에서 꺼내 쓴다.
// - Node 내장 기능(node:async_hooks)이라 라이브러리를 추가하지 않는다.
// - req 자체를 저장하는 이유: 미들웨어는 가드보다 먼저 실행되므로 저장 시점에는 req.user가 없다.
//   꺼낼 때 req.user를 읽으면 가드가 채운 값을 볼 수 있다.

const storage = new AsyncLocalStorage<Request>();

//* 요청 정보 조회 (HTTP 요청 밖 - 배치·시드 스크립트 등에서는 모두 undefined)
export const RequestContext = {
    request(): Request | undefined {
        return storage.getStore();
    },

    userId(): number | undefined {
        // req.user는 AccessTokenGuard가 넣는 값이라 express Request 타입에는 없다.
        const req = storage.getStore() as ( Request & { user?: TokenUserPayload } ) | undefined;
        const user = req?.user;
        return user?.id;
    },

    ip(): string | undefined {
        return storage.getStore()?.ip;
    },

    userAgent(): string | undefined {
        return storage.getStore()?.headers['user-agent'];
    },
};

//* 모든 요청을 컨텍스트 안에서 실행 (AppModule에서 forRoutes('*')로 등록)
// - main.ts의 app.use()가 아니라 Nest 미들웨어로 등록한다. app.use()는 body-parser보다 먼저 실행되는데,
//   body-parser는 스트림 이벤트 콜백에서 next()를 부르므로 그 뒤로 컨텍스트가 끊길 수 있다.
//   Nest 미들웨어는 body-parser 다음에 실행되고, 그 뒤의 가드·컨트롤러·서비스가 모두 next() 안에서 실행된다.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    use( req: Request, _res: Response, next: NextFunction ) {
        storage.run( req, next );
    }
}
