import { LeaveType, LeaveUnit } from "src/generated/prisma/client";
import { daysInclusive } from "./leave-grant.calc";

//! 휴가 신청 규칙 (features.md 7.4 "휴가 신청 규칙", 2026-11-12 사용자 결정)
// - 종일(FULL) 사용 일수 = 시작일~종료일 달력 일수. 주말·공휴일을 가정하지 않는다(쉬는 날은 신청자가 나눠 신청).
// - 반차 0.5일 / 반반차 0.25일, 하루 안. 시작 시각만 받고 종료 = 시작 + 4시간 / 2시간 (30분 단위, 24:00 넘으면 안 됨)
// - 같은 회원의 결재 진행 중·승인된 휴가와 시간이 겹치면 안 되고(2026-11-12), 합쳐서 하루 합계 1일까지
// - 날짜는 "YYYY-MM-DD", 시각은 "HH:mm", 일수는 quarter(0.25일 = 1) 정수로 다룬다.

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { ANNUAL: '연차', SICK: '병가', OFFICIAL: '공가' };
export const LEAVE_UNIT_LABEL: Record<LeaveUnit, string> = { FULL: '종일', HALF: '반차', QUARTER: '반반차' };

// 하루에 쓰는 양 (quarter)
const PER_DAY_QUARTERS: Record<LeaveUnit, number> = { FULL: 4, HALF: 2, QUARTER: 1 };
// 반차·반반차 길이 (분)
const PARTIAL_MINUTES: Partial<Record<LeaveUnit, number>> = { HALF: 240, QUARTER: 120 };
const TIME_STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

export interface LeaveInput {
    type: LeaveType;
    unit: LeaveUnit;
    startDate: string;
    endDate?: string | null;
    startTime?: string | null;
}

export interface LeavePeriod {
    type: LeaveType;
    unit: LeaveUnit;
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
    quarters: number; // 사용 일수 (quarter)
}

const pad = ( n: number ) => String( n ).padStart( 2, '0' );

export function minutesToTime( minutes: number ): string {
    return `${pad( Math.floor( minutes / 60 ) )}:${pad( minutes % 60 )}`;
}

function timeToMinutes( time: string ): number {
    const [ h, m ] = time.split( ':' ).map( Number );
    return h * 60 + m;
}

//* 신청 입력 검사 + 기간·시각·사용 일수 계산. 잘못되면 오류 문구를 던지지 않고 { error }로 돌려준다.
export function buildLeavePeriod( input: LeaveInput ): { period: LeavePeriod } | { error: string } {
    const { type, unit, startDate } = input;

    if ( unit === LeaveUnit.FULL ) {
        const endDate = input.endDate ?? startDate;
        if ( input.startTime ) return { error: '종일 휴가는 시각을 지정하지 않습니다.' };
        if ( endDate < startDate ) return { error: '종료일이 시작일보다 빠릅니다.' };
        if ( endDate.slice( 0, 4 ) !== startDate.slice( 0, 4 ) ) return { error: '연도를 걸치는 휴가는 연도별로 나눠 신청하세요.' };

        return { period: { type, unit, startDate, endDate, startTime: null, endTime: null, quarters: daysInclusive( startDate, endDate ) * 4 } };
    }

    // 반차·반반차: 하루 안, 시작 시각 필수
    if ( input.endDate && input.endDate !== startDate ) return { error: `${LEAVE_UNIT_LABEL[unit]}는 하루만 신청할 수 있습니다.` };
    if ( !input.startTime ) return { error: `${LEAVE_UNIT_LABEL[unit]}는 시작 시각이 필요합니다.` };

    const start = timeToMinutes( input.startTime );
    const end = start + PARTIAL_MINUTES[unit]!;
    if ( start % TIME_STEP_MINUTES !== 0 ) return { error: '시작 시각은 30분 단위로 지정하세요.' };
    if ( end > DAY_MINUTES ) return { error: `${LEAVE_UNIT_LABEL[unit]}가 그날 안에 끝나도록 시작 시각을 지정하세요.` };

    return {
        period: {
            type, unit, startDate, endDate: startDate,
            startTime: minutesToTime( start ), endTime: minutesToTime( end ),
            quarters: PER_DAY_QUARTERS[unit],
        },
    };
}

//* 하루 합계 검사: mine과 others(같은 회원의 진행 중·승인된 휴가)를 합쳐 어느 날이든 1일을 넘으면 그 날짜, 아니면 null
export function findOverbookedDate(
    mine: Pick<LeavePeriod, 'unit' | 'startDate' | 'endDate'>,
    others: Pick<LeavePeriod, 'unit' | 'startDate' | 'endDate'>[],
): string | null {
    const days = daysInclusive( mine.startDate, mine.endDate );
    for ( let i = 0; i < days; i++ ) {
        const date = addDays( mine.startDate, i );
        const used = others
            .filter( ( o ) => o.startDate <= date && date <= o.endDate )
            .reduce( ( sum, o ) => sum + PER_DAY_QUARTERS[o.unit], 0 );
        if ( used + PER_DAY_QUARTERS[mine.unit] > 4 ) return date;
    }
    return null;
}

type TimedPeriod = Pick<LeavePeriod, 'unit' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>;

//* 시간 겹침 검사 (2026-11-12 사용자 결정): mine과 시간이 겹치는 휴가가 있으면 { date, other }, 없으면 null
// - 종일은 그날 00:00~24:00 전체, 반차·반반차는 [시작, 종료) - 끝나는 시각에 다음 휴가가 시작하는 것은 겹치지 않음 (09:00~13:00 + 13:00~17:00 가능)
// - 하루 합계 1일 검사(findOverbookedDate)와 함께 쓴다. 시간이 안 겹쳐도 하루 합계가 넘으면 막힌다.
export function findTimeConflict<T extends TimedPeriod>( mine: TimedPeriod, others: T[] ): { date: string; other: T } | null {
    const range = ( p: TimedPeriod ): [ number, number ] =>
        p.unit === LeaveUnit.FULL || !p.startTime || !p.endTime ? [ 0, DAY_MINUTES ] : [ timeToMinutes( p.startTime ), timeToMinutes( p.endTime ) ];
    const [ myStart, myEnd ] = range( mine );

    for ( const other of others ) {
        // 날짜 구간이 겹치는 첫 날 (반차는 하루짜리라 겹치는 날이 곧 그 날)
        const from = mine.startDate > other.startDate ? mine.startDate : other.startDate;
        const to = mine.endDate < other.endDate ? mine.endDate : other.endDate;
        if ( from > to ) continue;

        const [ otherStart, otherEnd ] = range( other );
        if ( myStart < otherEnd && otherStart < myEnd ) return { date: from, other };
    }
    return null;
}

//* 캘린더용: 휴가를 날짜별로 묶기 (조회 범위 from~to 안의 날짜만, 휴가가 있는 날짜만, 날짜 오름차순)
// 여러 날짜에 걸친 종일 휴가는 범위 안의 날마다 들어간다. 날짜 안의 순서는 rows 순서를 따른다.
export function groupLeavesByDate<T extends Pick<LeavePeriod, 'startDate' | 'endDate'>>( rows: T[], from: string, to: string ): { date: string; items: T[] }[] {
    const byDate = new Map<string, T[]>();
    for ( const row of rows ) {
        let date = row.startDate > from ? row.startDate : from;
        const last = row.endDate < to ? row.endDate : to;
        while ( date <= last ) {
            byDate.set( date, [ ...( byDate.get( date ) ?? [] ), row ] );
            date = addDays( date, 1 );
        }
    }
    return [ ...byDate.entries() ].sort( ( [ a ], [ b ] ) => a.localeCompare( b ) ).map( ( [ date, items ] ) => ({ date, items }) );
}

//* 휴가 기간·시각 표시 ("2026-12-01 09:00~13:00" / "2026-12-01 ~ 2026-12-03")
export function periodLabel( p: TimedPeriod ): string {
    if ( p.unit !== LeaveUnit.FULL ) return `${p.startDate} ${p.startTime}~${p.endTime}`;
    return p.startDate === p.endDate ? p.startDate : `${p.startDate} ~ ${p.endDate}`;
}

//* 문서 제목: "[연차] 2026-12-01 ~ 2026-12-03 (3일)" / "[연차] 2026-12-01 반차 09:00~13:00 (0.5일)"
export function leaveTitle( period: LeavePeriod ): string {
    const label = `[${LEAVE_TYPE_LABEL[period.type]}]`;
    const days = `(${period.quarters / 4}일)`;

    if ( period.unit !== LeaveUnit.FULL ) {
        return `${label} ${period.startDate} ${LEAVE_UNIT_LABEL[period.unit]} ${period.startTime}~${period.endTime} ${days}`;
    }
    const range = period.startDate === period.endDate ? period.startDate : `${period.startDate} ~ ${period.endDate}`;
    return `${label} ${range} ${days}`;
}

// 날짜 + n일 ("2026-12-31" + 1 → "2027-01-01")
function addDays( date: string, n: number ): string {
    const [ y, m, d ] = date.split( '-' ).map( Number );
    const next = new Date( Date.UTC( y, m - 1, d + n ) );
    return `${next.getUTCFullYear()}-${pad( next.getUTCMonth() + 1 )}-${pad( next.getUTCDate() )}`;
}
