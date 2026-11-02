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

//* 주어진 시각이 속한 KST 날짜의 23:59:59
// 종료일을 포함하는 기간 조회(end >= 조회 시작)에 맞춰 그날 마지막 초로 둔다.
export function kstDayEnd( date: Date ): Date {
    return new Date( kstDayStart( date ).getTime() + ONE_DAY_MS - 1000 );
}
