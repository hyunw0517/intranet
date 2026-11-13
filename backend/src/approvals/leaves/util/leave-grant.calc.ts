//! 연차 부여 계산 (docs/design/leave_calculate_manual.md 3장, 2026-11-10 · 11-12 사용자 결정)
// 규칙을 바꾸면 매뉴얼 → 이 함수 → leave-grant.calc.spec.ts 예시표 순서로 함께 고친다.
// - 날짜는 KST 날짜 문자열 "YYYY-MM-DD"로 받는다. (시간대 계산을 이 함수 밖에서 끝낸다)
// - 결과는 0.25일 단위 정수(quarter, 1일 = 4)로 돌려준다. 부동소수점 오차 없이 계산하고 저장할 때만 Decimal로 바꾼다.

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const MONTHLY_MAX = 11;         // 1년 미만 월 단위 연차 최대 개수 (제60조 제2항)
const BASE_DAYS = 15;           // 1년 이상 기본 (제60조 제1항)
const MAX_DAYS = 25;            // 가산 한도 (제60조 제4항)

interface YMD { y: number; m: number; d: number } // m: 1~12

function parse( date: string ): YMD {
    const [ y, m, d ] = date.split( '-' ).map( Number );
    return { y, m, d };
}

function toUtc( { y, m, d }: YMD ): number {
    return Date.UTC( y, m - 1, d );
}

function format( { y, m, d }: YMD ): string {
    return `${y}-${String( m ).padStart( 2, '0' )}-${String( d ).padStart( 2, '0' )}`;
}

//* 개월 더하기 (말일 보정: 1/31 + 1개월 = 2/28, 윤년 2/29)
export function addMonthsClamped( date: string, months: number ): string {
    const { y, m, d } = parse( date );
    const total = ( m - 1 ) + months;
    const ny = y + Math.floor( total / 12 );
    const nm = ( ( total % 12 ) + 12 ) % 12 + 1;
    const lastDay = new Date( Date.UTC( ny, nm, 0 ) ).getUTCDate();

    return format({ y: ny, m: nm, d: Math.min( d, lastDay ) });
}

//* 두 날짜 사이 일수 (양 끝 포함)
export function daysInclusive( start: string, end: string ): number {
    return ( toUtc( parse( end ) ) - toUtc( parse( start ) ) ) / ONE_DAY_MS + 1;
}

//* 월 단위 연차 (입사한 해만): 입사일 + k개월(k = 1…11)이 입사한 해 안에 있고 asOf 이하인 개수
function monthlyCount( joinAt: string, asOf: string ): number {
    const joinYear = parse( joinAt ).y;
    let count = 0;
    for ( let k = 1; k <= MONTHLY_MAX; k++ ) {
        const date = addMonthsClamped( joinAt, k );
        if ( parse( date ).y === joinYear && date <= asOf ) count++; // "YYYY-MM-DD"는 문자열 비교 = 날짜 비교
    }
    return count;
}

//* 회계연도 year의 baseDays (quarter 단위) - 행을 만들지 않는 경우 null
// - year < 입사 연도, 입사일 > asOf(입사 예정)이면 null
// - 입사한 해: 월 단위(월 1일, asOf까지 생긴 만큼)
// - 다음 해부터: 연차 n = year − 입사 연도, 15 + floor((n−1)/2), 최대 25 (2026-11-12 사용자 결정: 다음 해 1/1에 15일 전부)
//   asOf와 무관하므로 12월에 미리 만든 다음 해 행도 1/1에 다시 계산한 값과 같다.
export function calcBaseQuarters( joinAt: string, year: number, asOf: string ): number | null {
    const joinYear = parse( joinAt ).y;
    if ( year < joinYear || joinAt > asOf ) return null;

    const n = year - joinYear;
    if ( n === 0 ) {
        return monthlyCount( joinAt, asOf ) * 4;
    }
    return Math.min( MAX_DAYS, BASE_DAYS + Math.floor( ( n - 1 ) / 2 ) ) * 4;
}

//* 재계산할 연도: 올해, 12월이면 다음 해도 (2026-11-12 사용자 결정 - 12월에 다음 해 연차를 미리 신청할 수 있게)
export function recalcYears( asOf: string ): number[] {
    const { y, m } = parse( asOf );
    return m === 12 ? [ y, y + 1 ] : [ y ];
}

//* quarter → Decimal 저장용 문자열 ("13.75")
export function quartersToDays( quarters: number ): string {
    return ( quarters / 4 ).toFixed( 2 );
}

//* Decimal(0.25 단위) → quarter. Prisma Decimal·문자열·숫자 모두 받는다.
export function daysToQuarters( days: { toString(): string } | number | null | undefined ): number {
    if ( days === null || days === undefined ) return 0;
    return Math.round( Number( days.toString() ) * 4 );
}
