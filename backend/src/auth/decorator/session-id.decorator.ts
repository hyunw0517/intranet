import { createParamDecorator, ExecutionContext } from "@nestjs/common";

//* 지금 요청의 로그인 세션 id (access token payload의 sid)
//  - AccessTokenGuard가 req.sessionId에 넣어 둔다.
//  - 세션 도입 전에 발급된 토큰이면 undefined일 수 있다.
export const SessionId = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
    const req = context.switchToHttp().getRequest<{ sessionId?: string }>();

    return req.sessionId;
});
