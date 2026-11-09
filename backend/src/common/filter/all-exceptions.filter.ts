import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Request } from "express";
import { RequestContext } from "../context/request-context";

//! 전역 예외 필터 (AppModule의 APP_FILTER로 등록)
// - 목적: 5xx가 났을 때 "어떤 요청에서" 났는지(메서드·경로·작업자)를 스택과 함께 남긴다.
//   Nest 기본 처리도 500 스택은 남기지만 요청 정보가 없다.
// - 4xx(검증 실패·권한 없음·없는 리소스)는 정상적인 응답이라 남기지 않는다.
// - 응답 형식은 Nest 기본과 같다. (프론트 영향 없음)
//   BaseExceptionFilter를 상속하지 않는 이유: 처리되지 않은 예외는 기본 필터도 로그를 남겨서 같은 에러가 두 번 찍힌다.
// - 요청 본문은 남기지 않는다. (비밀번호 등 민감 정보)
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {

    private readonly logger = new Logger( 'HTTP' );

    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
    ){}

    catch( exception: unknown, host: ArgumentsHost ) {
        // HTTP 요청만 처리한다. (채팅 Socket.IO Gateway는 구현 시 WsExceptionFilter를 따로 둔다)
        if ( host.getType() !== 'http' ) {
            this.logger.error( `${host.getType()} 예외`, exception instanceof Error ? exception.stack : String( exception ) );
            return;
        }

        const { httpAdapter } = this.httpAdapterHost;
        const ctx = host.switchToHttp();
        const req = ctx.getRequest<Request>();
        const res = ctx.getResponse<unknown>();

        const status = exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        if ( status >= 500 ) {
            const userId = RequestContext.userId();
            this.logger.error(
                `${req.method} ${req.originalUrl} ${status} user=${userId ?? '-'}`,
                exception instanceof Error ? exception.stack : String( exception ),
            );
        }

        // 파일 스트리밍 등으로 응답이 이미 시작됐으면 본문을 보낼 수 없으므로 연결만 끝낸다.
        if ( httpAdapter.isHeadersSent( res ) ) {
            httpAdapter.end( res );
            return;
        }

        httpAdapter.reply( res, this.toBody( exception, status ), status );
    }

    //* 응답 본문 (Nest 기본 형식)
    // - HttpException: getResponse()가 객체면 그대로({ statusCode, message, error }), 문자열이면 { statusCode, message }
    // - 그 외(Prisma 오류·코드 버그 등): 내부 정보를 숨기고 { statusCode: 500, message: 'Internal server error' }
    private toBody( exception: unknown, status: number ): object {
        if ( exception instanceof HttpException ) {
            const response = exception.getResponse();
            return typeof response === 'string'
                ? { statusCode: status, message: response }
                : response;
        }

        return { statusCode: status, message: 'Internal server error' };
    }
}
