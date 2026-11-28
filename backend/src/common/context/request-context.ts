import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { TokenUserPayload } from "src/auth/types/jwt-payload.type";

//! 요청 컨텍스트 (AsyncLocalStorage)
// 감사 로그용 작업자·IP·User-Agent를 서비스 인자로 넘기지 않으려고 요청마다 req를 저장해 둔다.
// req 자체를 저장하는 이유: 미들웨어는 가드보다 먼저 돌아서 저장 시점에는 req.user가 없다.

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
// app.use()로 등록하면 body-parser보다 먼저 돌고, body-parser가 스트림 콜백에서 next()를 불러 컨텍스트가 끊길 수 있다.
// Nest 미들웨어는 body-parser 다음에 돌아서 이 문제가 없다.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    use( req: Request, _res: Response, next: NextFunction ) {
        storage.run( req, next );
    }
}
