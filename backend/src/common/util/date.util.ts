// 회사 기준 시간대(KST) 날짜 계산
// 서버(EC2)는 보통 UTC로 동작하므로 setHours(0, 0, 0, 0) 같은 서버 시간대 기준 계산을 쓰지 않는다.
// 사내 인트라넷이라 시간대는 KST(+09:00) 하나로 고정한다. (일광 절약 시간 없음)

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

//* 주어진 시각이 속한 KST 날짜의 00:00:00
// ex) 2026-11-03T10:00+09:00 → 2026-11-03T00:00+09:00 (= 2026-11-02T15:00:00Z)
export function kstDayStart( date: Date ): Date {
    // KST 벽시계 시각을 UTC 필드로 읽기 위해 9시간 이동한 뒤, 그날 자정으로 자르고 다시 되돌린다.
    const kst = new Date( date.getTime() + KST_OFFSET_MS );
    const midnight = Date.UTC( kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() );

    return new Date( midnight - KST_OFFSET_MS );
}

//* 주어진 시각의 KST 연·월 경로 ("2026/11")
// 업로드 파일 저장 위치(images/2026/11/<uuid>.png)에 쓴다. KST 11월 1일 08시(UTC 10월 31일)도 11월 폴더로 간다.
export function kstYearMonthPath( date: Date ): string {
    const kst = new Date( date.getTime() + KST_OFFSET_MS );
    const month = String( kst.getUTCMonth() + 1 ).padStart( 2, '0' );

    return `${kst.getUTCFullYear()}/${month}`;
}

//* 주어진 시각이 속한 KST 날짜의 23:59:59
// 종료일을 포함하는 기간 조회(end >= 조회 시작)에 맞춰 그날 마지막 초로 둔다.
export function kstDayEnd( date: Date ): Date {
    return new Date( kstDayStart( date ).getTime() + ONE_DAY_MS - 1000 );
}

//* 주어진 시각이 KST 날짜 00:00부터 몇 분째인지 (초·밀리초가 있으면 소수)
// ex) 2026-11-10T10:30+09:00 → 630
export function kstMinuteOfDay( date: Date ): number {
    return ( date.getTime() - kstDayStart( date ).getTime() ) / 60000;
}

//* 주어진 시각의 KST 요일 (ISO: 1 = 월 … 7 = 일)
export function kstIsoWeekday( date: Date ): number {
    const day = new Date( date.getTime() + KST_OFFSET_MS ).getUTCDay(); // 0 = 일
    return day === 0 ? 7 : day;
}

//* 주어진 시각의 KST 날짜 문자열 ("2026-11-10")
export function kstDateString( date: Date ): string {
    const kst = new Date( date.getTime() + KST_OFFSET_MS );
    const month = String( kst.getUTCMonth() + 1 ).padStart( 2, '0' );
    const day = String( kst.getUTCDate() ).padStart( 2, '0' );

    return `${kst.getUTCFullYear()}-${month}-${day}`;
}

//* KST 날짜 문자열("2026-11-10") + 그날 00:00부터의 분 → 시각
// ex) ("2026-11-10", 600) → 2026-11-10T10:00+09:00 (= 2026-11-10T01:00:00Z)
export function kstDateAt( dateString: string, minuteOfDay: number ): Date {
    const [ year, month, day ] = dateString.split( '-' ).map( Number );

    return new Date( Date.UTC( year, month - 1, day ) - KST_OFFSET_MS + minuteOfDay * 60000 );
}

//* KST 날짜 문자열에 일 수 더하기 ("2026-11-30", 1 → "2026-12-01")
export function addKstDays( dateString: string, days: number ): string {
    return kstDateString( new Date( kstDateAt( dateString, 0 ).getTime() + days * ONE_DAY_MS ) );
}
