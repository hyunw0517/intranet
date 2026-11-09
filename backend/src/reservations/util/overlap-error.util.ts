import { Prisma } from "src/generated/prisma/client";

// 예약 겹침 DB 제약 이름 (마이그레이션 20261109224642_facility_reservation_rules)
const OVERLAP_CONSTRAINT = 'facility_reservation_no_overlap';

//* DB의 예약 겹침 제약(exclusion constraint) 위반인지
// 서비스는 트랜잭션 안에서 겹침을 먼저 검사하지만, 검사와 저장 사이에 다른 요청이 같은 시간을 저장하면 여기로 온다. (동시 요청)
// Prisma 7 + 드라이버 어댑터에서는 PrismaClientKnownRequestError의 meta.driverAdapterError.cause에
// PostgreSQL 원래 오류 코드(23P01)와 메시지(제약 이름 포함)가 담겨 온다. (2026-11-09 실제 오류로 확인)
export function isReservationOverlapError( error: unknown ): boolean {
    if ( !( error instanceof Prisma.PrismaClientKnownRequestError ) ) return false;

    const cause = ( error.meta as { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } | undefined )
        ?.driverAdapterError?.cause;

    return cause?.originalCode === '23P01' && ( cause.originalMessage ?? '' ).includes( OVERLAP_CONSTRAINT );
}
