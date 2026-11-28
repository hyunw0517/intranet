import { createParamDecorator, ExecutionContext } from "@nestjs/common";

//* 지금 요청의 로그인 세션 id (access token의 sid)
// 세션 도입 전 토큰이면 undefined
export const SessionId = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
    const req = context.switchToHttp().getRequest<{ sessionId?: string }>();

    return req.sessionId;
});
