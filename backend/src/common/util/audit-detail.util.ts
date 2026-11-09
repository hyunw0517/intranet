import { Prisma } from "src/generated/prisma/client";

//! 감사 로그 detail 형식 (Audit.detail, jsonb)
// - 단건:     { changes: { role: { before: "GUEST", after: "USER" } }, ...추가 정보 }
// - 일괄 처리: { batch: true, targetIds: [5, 7], changes: { role: { before: { "5": "GUEST", "7": "USER" }, after: "ADMIN" } } }
//   일괄 처리는 대상마다 변경 전 값이 다를 수 있으므로 before를 pk별로 남긴다. (2026-11-09 사용자 결정)

//* 단건 변경 내용: 필드명 → 변경 전/후
export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

//* 일괄 변경 내용: 필드명 → pk별 변경 전 값 / 공통 변경 후 값
export type AuditBatchChanges = Record<string, { before: Record<string, unknown>; after: unknown }>;

//* 감사 로그에 절대 남기지 않는 필드 (비밀번호·토큰 해시 등)
const SENSITIVE_KEYS = new Set([ 'password', 'tokenHash', 'currentJti', 'previousJti' ]);

//* 수정 전 행과 수정 값을 비교해 바뀐 필드만 남긴다.
// - after에 없는(undefined) 필드는 수정하지 않은 것으로 보고 제외한다.
// - Date는 시각 값으로 비교한다. (객체 비교 X)
// ex) diffChanges( before, body ) → { name: { before: '홍길동', after: '김철수' } }
// - before(DB 행)와 after(수정 데이터)의 타입이 다를 수 있으므로(예: DTO 문자열 날짜 → Date) 객체로만 받는다.
export function diffChanges( before: object, after: object ): AuditChanges {
    const changes: AuditChanges = {};

    for ( const [key, next] of Object.entries( after ) ) {
        if ( next === undefined || SENSITIVE_KEYS.has( key ) ) continue;

        const prev = ( before as Record<string, unknown> )[key];
        if ( !isSameValue( prev, next ) ) {
            changes[key] = { before: prev ?? null, after: next };
        }
    }

    return changes;
}

//* 일괄 처리 변경 내용: 수정 전 행 목록에서 pk별 변경 전 값을 모은다.
// ex) batchChanges( users, 'role', 'ADMIN' ) → { role: { before: { "5": "GUEST", "7": "USER" }, after: "ADMIN" } }
export function batchChanges<T extends { id: number }, K extends keyof T & string>(
    rows: T[],
    field: K,
    after: T[K],
): AuditBatchChanges {
    const before: Record<string, unknown> = {};
    for ( const row of rows ) {
        before[String( row.id )] = row[field] ?? null;
    }

    return { [field]: { before, after } };
}

//* Prisma Json 컬럼에 넣을 수 있는 값으로 변환
// - Date → ISO 문자열, BigInt → 문자열, undefined 필드 제거 (JSON 직렬화 규칙)
// - 민감 필드는 어느 깊이에 있든 제거한다. (호출하는 쪽 실수 방지)
export function toAuditJson( value: Record<string, unknown> ): Prisma.InputJsonObject {
    return JSON.parse( JSON.stringify( value, ( key, v: unknown ) => {
        if ( SENSITIVE_KEYS.has( key ) ) return undefined;
        if ( typeof v === 'bigint' ) return v.toString();
        return v;
    } ) ) as Prisma.InputJsonObject;
}

//* JSON 형태로 비교 (Date는 ISO 문자열, 배열·객체는 내용으로 비교. undefined와 null은 같게 본다)
function isSameValue( a: unknown, b: unknown ): boolean {
    const toKey = ( v: unknown ) => JSON.stringify( v ?? null, ( _k, x: unknown ) => typeof x === 'bigint' ? x.toString() : x );
    return toKey( a ) === toKey( b );
}
