import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Request } from "express";
import { RequestContext } from "../context/request-context";

//! 전역 예외 필터 (AppModule의 APP_FILTER로 등록)
// 5xx가 나면 메서드·경로·작업자를 스택과 함께 남긴다. Nest 기본 처리는 요청 정보를 남기지 않는다.
// 4xx는 정상 응답이라 남기지 않고, 요청 본문도 민감 정보가 있어 남기지 않는다.
// BaseExceptionFilter를 상속하면 같은 에러가 두 번 찍혀서 응답 형식만 똑같이 맞췄다.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {

    private readonly logger = new Logger( 'HTTP' );

    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
    ){}

    catch( exception: unknown, host: ArgumentsHost ) {
        // HTTP 요청만 처리한다
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

        // 파일 스트리밍 등으로 응답이 이미 시작됐으면 연결만 끝낸다
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
