//! leave-grant.calc.ts 단위 테스트
// 기준표 = docs/design/leave_calculate_manual.md 3.4 예시표 (asOf = 그 연도 12/31). 규칙을 바꾸면 매뉴얼과 이 표를 함께 고친다.

import { addMonthsClamped, calcBaseQuarters, daysInclusive, daysToQuarters, quartersToDays, recalcYears } from './leave-grant.calc';

const days = ( joinAt: string, year: number, asOf = `${year}-12-31` ) => {
    const q = calcBaseQuarters( joinAt, year, asOf );
    return q === null ? null : q / 4;
};

describe('calcBaseQuarters - 매뉴얼 3.4 예시표', () => {
    it.each([
        [ '2026-07-01', 2026, 5 ],      // 입사한 해: 월 단위 8/1~12/1
        [ '2026-07-01', 2027, 15 ],     // 다음 해: 15일 (남은 월 단위·비례 부여 없음)
        [ '2026-07-01', 2028, 15 ],
        [ '2026-07-01', 2029, 16 ],     // 3년차 첫 가산
        [ '2026-07-01', 2031, 17 ],
        [ '2026-01-01', 2026, 11 ],
        [ '2026-01-01', 2027, 15 ],
        [ '2026-12-31', 2026, 0 ],      // 첫 월차일 2027-01-31 (입사한 해가 아님)
        [ '2026-12-31', 2027, 15 ],
        [ '2026-01-31', 2026, 11 ],     // 말일 보정 (2/28, 3/31, … 12/31)
        [ '2006-03-01', 2026, 24 ],     // 15 + floor(19/2)
        [ '2005-03-01', 2026, 25 ],     // 한도
        [ '2000-03-01', 2026, 25 ],     // 한도
    ])( '입사 %s, %i년 → %d일', ( joinAt, year, expected ) => {
        expect( days( joinAt, year ) ).toBe( expected );
    });

    it('입사한 해 중간 asOf: 그날까지 생긴 월 단위만 (2026-07-01 입사, 10/1 기준 → 3)', () => {
        expect( days( '2026-07-01', 2026, '2026-10-01' ) ).toBe( 3 );
        expect( days( '2026-07-01', 2026, '2026-09-30' ) ).toBe( 2 );
    });

    it('12월에 미리 계산한 다음 해 값은 1/1에 다시 계산한 값과 같다', () => {
        expect( days( '2026-07-01', 2027, '2026-12-01' ) ).toBe( days( '2026-07-01', 2027, '2027-01-01' ) );
        expect( days( '2026-07-01', 2027, '2026-12-01' ) ).toBe( 15 );
    });

    it('입사 전 연도·입사 예정이면 행을 만들지 않는다(null)', () => {
        expect( days( '2026-07-01', 2025 ) ).toBeNull();
        expect( days( '2026-07-01', 2026, '2026-06-30' ) ).toBeNull();
        expect( days( '2027-01-02', 2027, '2026-12-01' ) ).toBeNull(); // 12월에 다음 해 입사 예정자
    });
});

describe('recalcYears', () => {
    it('12월에는 다음 해도 함께 계산한다', () => {
        expect( recalcYears( '2026-11-30' ) ).toEqual([ 2026 ]);
        expect( recalcYears( '2026-12-01' ) ).toEqual([ 2026, 2027 ]);
        expect( recalcYears( '2027-01-01' ) ).toEqual([ 2027 ]);
    });
});

describe('날짜 보조 함수', () => {
    it('addMonthsClamped: 말일 보정, 연도 넘김', () => {
        expect( addMonthsClamped( '2026-01-31', 1 ) ).toBe( '2026-02-28' );
        expect( addMonthsClamped( '2028-01-31', 1 ) ).toBe( '2028-02-29' );
        expect( addMonthsClamped( '2026-12-31', 11 ) ).toBe( '2027-11-30' );
    });

    it('daysInclusive: 양 끝 포함', () => {
        expect( daysInclusive( '2026-07-01', '2026-12-31' ) ).toBe( 184 );
        expect( daysInclusive( '2026-03-01', '2026-03-01' ) ).toBe( 1 );
    });

    it('quarter ↔ 일수', () => {
        expect( quartersToDays( 55 ) ).toBe( '13.75' );
        expect( daysToQuarters( '13.75' ) ).toBe( 55 );
        expect( daysToQuarters( -1.5 ) ).toBe( -6 );
        expect( daysToQuarters( null ) ).toBe( 0 );
    });
});
