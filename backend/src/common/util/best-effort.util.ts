import { Logger } from "@nestjs/common";

//* 실패해도 업무를 막지 않는 작업 (알림 등)
// 커밋 후 호출하고, 실패하면 서버 로그만 남긴다. 감사 로그처럼 빠지면 안 되는 기록에는 쓰지 않는다.
export async function bestEffort( logger: Logger, label: string, fn: () => Promise<unknown> ): Promise<void> {
    try {
        await fn();
    } catch ( e ) {
        logger.error( `${label} 실패 (업무는 완료됨)`, e instanceof Error ? e.stack : String( e ) );
    }
}
