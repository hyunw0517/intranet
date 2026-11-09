import { PrismaClient } from 'src/generated/prisma/client';

//* 테스트 DB 초기화: public 스키마의 모든 테이블을 비우고 id 시퀀스를 1부터 다시 시작한다.
// - 각 e2e 파일의 beforeAll에서 호출하고, 그 파일에 필요한 행(회원·회의실 등)만 다시 넣는다.
// - 트랜잭션 롤백 방식은 쓰지 않는다: 동시 예약 테스트는 요청 여러 개가 각자 커밋해야 경쟁 상태가 재현된다.
// - 테이블 목록은 DB에서 읽는다. (모델이 늘어도 고칠 필요 없음, 마이그레이션 기록 테이블만 제외)
// - CASCADE: FK 순서를 신경 쓰지 않고 한 번에 비운다.
export async function resetDatabase( prisma: PrismaClient ) {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    if ( !db.endsWith( '_test' ) ) {
        throw new Error( `테스트 DB가 아니라 초기화하지 않는다: ${db}` );
    }

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if ( tables.length === 0 ) return;

    const list = tables.map( ( t ) => `"public"."${t.tablename}"` ).join( ', ' );
    await prisma.$executeRawUnsafe( `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE` );
}
