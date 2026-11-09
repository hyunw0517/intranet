import { addKstDays, kstDateAt, kstDateString, kstDayStart, kstIsoWeekday, kstMinuteOfDay } from "src/common/util/date.util";

// 시설 예약 시간 규칙 (DB 조회 없음, docs/design/features.md 6장)
// 서비스가 분류(FacilityCategory)를 조회한 뒤 이 함수들로 판단한다. 조회와 판단을 나눠 판단만 단위 테스트한다.
// 시각은 모두 한국 시간(KST) 기준이다. (서버는 UTC로 동작할 수 있으므로 date.util의 KST 함수만 쓴다)

//* 분류가 정한 예약 규칙
export interface ReservationRules {
    slotMinutes: number;        // 예약 단위(분)
    openMinute: number;         // 운영 시작 (자정부터 분)
    closeMinute: number;        // 운영 종료 (자정부터 분, 최대 1440)
    operatingDays: number[];    // 운영 요일 (ISO: 1 = 월 … 7 = 일)
    maxAdvanceDays: number;     // 오늘부터 며칠 앞까지 예약 가능
}

//* 규칙 위반 종류 - 반복 예약은 NOT_OPERATING_DAY·PAST인 날짜만 건너뛰고, 나머지는 요청 전체를 거부한다.
export type ReservationRuleCode =
    | 'INVALID_RANGE'       // 종료 <= 시작
    | 'PAST'                // 이미 시작 시각이 지남
    | 'MULTI_DAY'           // 하루를 넘김
    | 'NOT_OPERATING_DAY'   // 운영하지 않는 요일
    | 'OUTSIDE_HOURS'       // 운영 시간 밖
    | 'SLOT'                // 예약 단위에 맞지 않음
    | 'TOO_FAR';            // 예약 가능 기간을 넘음

export interface ReservationRuleError {
    code: ReservationRuleCode;
    message: string;
}

const WEEKDAY_NAMES = [ '', '월', '화', '수', '목', '금', '토', '일' ];

//* 분 → "HH:mm" (1440 → "24:00")
export function formatHm( minute: number ): string {
    const h = String( Math.floor( minute / 60 ) ).padStart( 2, '0' );
    const m = String( minute % 60 ).padStart( 2, '0' );
    return `${h}:${m}`;
}

//* "HH:mm" → 분 ("24:00"까지 허용, 형식이 틀리면 null)
export function parseHm( value: string ): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec( value );
    if ( !match ) return null;

    const [ hour, minute ] = [ Number( match[1] ), Number( match[2] ) ];
    if ( minute > 59 || hour > 24 || ( hour === 24 && minute !== 0 ) ) return null;

    return hour * 60 + minute;
}

//* 분류 설정 자체의 검사 (분류 생성·수정 시) - 문제가 있으면 메시지, 없으면 null
// DB CHECK 제약과 같은 내용 + "운영 시간이 예약 단위로 나누어떨어지는지"(마지막 칸이 잘리지 않게)
export function checkCategorySettings( rules: Pick<ReservationRules, 'slotMinutes' | 'openMinute' | 'closeMinute'> ): string | null {
    if ( rules.openMinute >= rules.closeMinute ) {
        return '운영 종료 시각은 시작 시각보다 뒤여야 합니다.';
    }
    if ( ( rules.closeMinute - rules.openMinute ) % rules.slotMinutes !== 0 ) {
        return `운영 시간(${formatHm( rules.openMinute )}~${formatHm( rules.closeMinute )})이 예약 단위(${rules.slotMinutes}분)로 나누어떨어져야 합니다.`;
    }
    return null;
}

//* 예약 시간이 분류 규칙에 맞는지 - 위반이면 { code, message }, 맞으면 null
// 검사 순서가 곧 메시지 우선순위다. (범위 → 과거 → 하루 → 요일 → 운영 시간 → 단위 → 예약 가능 기간)
// - 범위는 [start, end): end 시각은 예약에 포함되지 않는다. 운영 종료 18:00이면 17:00~18:00까지 가능
// - "지난 예약"과 같은 기준으로, 시작 시각이 now 이하면 PAST
export function checkReservationTime(
    start: Date,
    end: Date,
    rules: ReservationRules,
    now: Date,
): ReservationRuleError | null {
    if ( end.getTime() <= start.getTime() ) {
        return { code: 'INVALID_RANGE', message: '종료 시각은 시작 시각보다 뒤여야 합니다.' };
    }

    if ( start.getTime() <= now.getTime() ) {
        return { code: 'PAST', message: '이미 지난 시각은 예약할 수 없습니다.' };
    }

    // 종료는 시작한 날의 24:00(= 다음 날 00:00)까지 허용
    const startMinute = kstMinuteOfDay( start );
    const endMinute = ( end.getTime() - kstDayStart( start ).getTime() ) / 60000;
    if ( endMinute > 1440 ) {
        return { code: 'MULTI_DAY', message: '예약은 하루 안에서만 할 수 있습니다.' };
    }

    const weekday = kstIsoWeekday( start );
    if ( !rules.operatingDays.includes( weekday ) ) {
        return { code: 'NOT_OPERATING_DAY', message: `${WEEKDAY_NAMES[weekday]}요일은 운영하지 않습니다.` };
    }

    if ( startMinute < rules.openMinute || endMinute > rules.closeMinute ) {
        return {
            code: 'OUTSIDE_HOURS',
            message: `운영 시간(${formatHm( rules.openMinute )}~${formatHm( rules.closeMinute )}) 안에서만 예약할 수 있습니다.`,
        };
    }

    // 운영 시작부터 단위로 나눈 칸에 맞아야 한다. (초·밀리초가 있으면 소수가 되어 여기서 걸린다)
    if ( ( startMinute - rules.openMinute ) % rules.slotMinutes !== 0 || ( endMinute - rules.openMinute ) % rules.slotMinutes !== 0 ) {
        return { code: 'SLOT', message: `예약은 ${rules.slotMinutes}분 단위로 할 수 있습니다.` };
    }

    if ( kstDateString( start ) > lastBookableDate( rules, now ) ) {
        return { code: 'TOO_FAR', message: `오늘부터 ${rules.maxAdvanceDays}일 뒤까지만 예약할 수 있습니다.` };
    }

    return null;
}

//* 예약할 수 있는 마지막 날짜 (KST "YYYY-MM-DD") = 오늘 + maxAdvanceDays
export function lastBookableDate( rules: Pick<ReservationRules, 'maxAdvanceDays'>, now: Date ): string {
    return addKstDays( kstDateString( now ), rules.maxAdvanceDays );
}

//* 예약 시간 표기 (알림·감사 로그 문구용, KST) - "2026-11-12 10:00~11:00"
export function formatReservationTime( start: Date, end: Date ): string {
    const endMinute = ( end.getTime() - kstDayStart( start ).getTime() ) / 60000;
    return `${kstDateString( start )} ${formatHm( kstMinuteOfDay( start ) )}~${formatHm( endMinute )}`;
}

//* 반복 예약 날짜 목록: startDate ~ endDate(포함) 중 고른 요일인 날짜 ("YYYY-MM-DD", 오름차순)
// 운영 요일·과거 여부는 여기서 거르지 않는다. (건너뛴 이유를 응답에 담기 위해 checkReservationTime에서 판단)
export function listRecurringDates( startDate: string, endDate: string, weekdays: number[] ): string[] {
    const dates: string[] = [];

    for ( let date = startDate; date <= endDate; date = addKstDays( date, 1 ) ) {
        if ( weekdays.includes( kstIsoWeekday( kstDateAt( date, 0 ) ) ) ) {
            dates.push( date );
        }
    }

    return dates;
}
