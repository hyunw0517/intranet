//! leave-request.util.ts 단위 테스트
// 휴가 신청 규칙(features.md 7.4 "휴가 신청 규칙")을 DB 없이 확인한다.

import { LeaveType, LeaveUnit } from 'src/generated/prisma/client';
import { buildLeavePeriod, findOverbookedDate, findTimeConflict, groupLeavesByDate, LeavePeriod, leaveTitle } from './leave-request.util';

const build = ( input: Parameters<typeof buildLeavePeriod>[0] ) => {
    const result = buildLeavePeriod( input );
    if ( 'error' in result ) throw new Error( result.error );
    return result.period;
};
const errorOf = ( input: Parameters<typeof buildLeavePeriod>[0] ) => {
    const result = buildLeavePeriod( input );
    return 'error' in result ? result.error : null;
};

describe('buildLeavePeriod', () => {
    it('종일: 달력 일수 (주말 포함, 서버는 쉬는 날을 가정하지 않는다)', () => {
        const p = build({ type: LeaveType.ANNUAL, unit: LeaveUnit.FULL, startDate: '2026-12-04', endDate: '2026-12-07' }); // 금~월
        expect( p.quarters ).toBe( 16 );
        expect([ p.startTime, p.endTime ]).toEqual([ null, null ]);
    });

    it('종일: 종료일을 비우면 하루', () => {
        expect( build({ type: LeaveType.SICK, unit: LeaveUnit.FULL, startDate: '2026-12-04' }) ).toMatchObject({ endDate: '2026-12-04', quarters: 4 });
    });

    it('종일: 종료일이 빠르거나 연도를 걸치거나 시각을 넣으면 거부', () => {
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.FULL, startDate: '2026-12-04', endDate: '2026-12-03' }) ).toMatch( /종료일/ );
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.FULL, startDate: '2026-12-31', endDate: '2027-01-02' }) ).toMatch( /연도/ );
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.FULL, startDate: '2026-12-04', startTime: '09:00' }) ).toMatch( /시각/ );
    });

    it('반차 +4시간, 반반차 +2시간', () => {
        expect( build({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04', startTime: '09:00' }) )
            .toMatchObject({ endDate: '2026-12-04', startTime: '09:00', endTime: '13:00', quarters: 2 });
        expect( build({ type: LeaveType.ANNUAL, unit: LeaveUnit.QUARTER, startDate: '2026-12-04', startTime: '16:30' }) )
            .toMatchObject({ startTime: '16:30', endTime: '18:30', quarters: 1 });
    });

    it('반차: 시각 필수, 30분 단위, 그날 안에 끝나야 하고, 하루만', () => {
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04' }) ).toMatch( /시작 시각이 필요/ );
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04', startTime: '09:10' }) ).toMatch( /30분/ );
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04', startTime: '20:30' }) ).toMatch( /그날 안/ );
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04', startTime: '20:00' }) ).toBeNull(); // 24:00 종료
        expect( errorOf({ type: LeaveType.ANNUAL, unit: LeaveUnit.HALF, startDate: '2026-12-04', endDate: '2026-12-05', startTime: '09:00' }) ).toMatch( /하루만/ );
    });
});

describe('findOverbookedDate - 하루 합계 1일까지', () => {
    const full = ( startDate: string, endDate = startDate ) => ({ unit: LeaveUnit.FULL, startDate, endDate });
    const half = ( date: string ) => ({ unit: LeaveUnit.HALF, startDate: date, endDate: date });
    const quarter = ( date: string ) => ({ unit: LeaveUnit.QUARTER, startDate: date, endDate: date });

    it('겹치는 날이 없으면 통과', () => {
        expect( findOverbookedDate( full( '2026-12-01', '2026-12-03' ), [ full( '2026-12-04' ), half( '2026-11-30' ) ] ) ).toBeNull();
    });

    it('같은 날 반차 두 건, 반차 + 반반차 두 건은 통과', () => {
        expect( findOverbookedDate( half( '2026-12-01' ), [ half( '2026-12-01' ) ] ) ).toBeNull();
        expect( findOverbookedDate( quarter( '2026-12-01' ), [ half( '2026-12-01' ), quarter( '2026-12-01' ) ] ) ).toBeNull();
    });

    it('종일 + 반차, 반차 세 건은 거부 (넘치는 첫 날짜)', () => {
        expect( findOverbookedDate( full( '2026-12-01', '2026-12-03' ), [ half( '2026-12-02' ) ] ) ).toBe( '2026-12-02' );
        expect( findOverbookedDate( half( '2026-12-01' ), [ half( '2026-12-01' ), quarter( '2026-12-01' ) ] ) ).toBe( '2026-12-01' );
        expect( findOverbookedDate( half( '2026-12-02' ), [ full( '2026-12-01', '2026-12-05' ) ] ) ).toBe( '2026-12-02' );
    });
});

describe('findTimeConflict - 시간 겹침', () => {
    const full = ( startDate: string, endDate = startDate ) => ({ unit: LeaveUnit.FULL, startDate, endDate, startTime: null, endTime: null });
    const part = ( unit: LeaveUnit, date: string, startTime: string, endTime: string ) => ({ unit, startDate: date, endDate: date, startTime, endTime });

    it('반차끼리 시간이 겹치면 그 날짜와 상대 휴가', () => {
        const other = part( LeaveUnit.HALF, '2026-12-01', '09:00', '13:00' );
        expect( findTimeConflict( part( LeaveUnit.HALF, '2026-12-01', '11:00', '15:00' ), [ other ] ) ).toEqual({ date: '2026-12-01', other });
        expect( findTimeConflict( part( LeaveUnit.QUARTER, '2026-12-01', '12:30', '14:30' ), [ other ] ) ).not.toBeNull();
    });

    it('끝나는 시각에 시작하거나 날짜가 다르면 겹치지 않는다', () => {
        const other = part( LeaveUnit.HALF, '2026-12-01', '09:00', '13:00' );
        expect( findTimeConflict( part( LeaveUnit.HALF, '2026-12-01', '13:00', '17:00' ), [ other ] ) ).toBeNull();
        expect( findTimeConflict( part( LeaveUnit.HALF, '2026-12-02', '09:00', '13:00' ), [ other ] ) ).toBeNull();
    });

    it('종일은 그날 전체: 기간 안의 반차와 겹치고, 겹치는 첫 날짜를 준다', () => {
        expect( findTimeConflict( full( '2026-12-01', '2026-12-05' ), [ part( LeaveUnit.QUARTER, '2026-12-03', '22:00', '24:00' ) ] )?.date ).toBe( '2026-12-03' );
        expect( findTimeConflict( part( LeaveUnit.HALF, '2026-12-04', '09:00', '13:00' ), [ full( '2026-12-03', '2026-12-05' ) ] )?.date ).toBe( '2026-12-04' );
        expect( findTimeConflict( full( '2026-12-01', '2026-12-03' ), [ full( '2026-12-03', '2026-12-04' ) ] )?.date ).toBe( '2026-12-03' );
        expect( findTimeConflict( full( '2026-12-01' ), [ full( '2026-12-02' ) ] ) ).toBeNull();
    });
});

describe('groupLeavesByDate - 캘린더 날짜별 묶기', () => {
    const row = ( name: string, startDate: string, endDate = startDate ) => ({ name, startDate, endDate });

    it('여러 날 휴가는 날마다, 조회 범위 밖 날짜는 빼고, 날짜 오름차순', () => {
        const result = groupLeavesByDate( [ row( 'A', '2026-11-29', '2026-12-02' ), row( 'B', '2026-12-01' ) ], '2026-12-01', '2026-12-31' );
        expect( result.map( ( d ) => [ d.date, d.items.map( ( i ) => i.name ) ] ) ).toEqual([
            [ '2026-12-01', [ 'A', 'B' ] ],
            [ '2026-12-02', [ 'A' ] ],
        ]);
    });

    it('휴가가 없으면 빈 배열', () => {
        expect( groupLeavesByDate( [], '2026-12-01', '2026-12-31' ) ).toEqual([]);
    });
});

describe('leaveTitle', () => {
    const base: LeavePeriod = { type: LeaveType.ANNUAL, unit: LeaveUnit.FULL, startDate: '2026-12-01', endDate: '2026-12-03', startTime: null, endTime: null, quarters: 12 };

    it('종일 기간 / 하루 / 반차', () => {
        expect( leaveTitle( base ) ).toBe( '[연차] 2026-12-01 ~ 2026-12-03 (3일)' );
        expect( leaveTitle({ ...base, type: LeaveType.SICK, endDate: '2026-12-01', quarters: 4 }) ).toBe( '[병가] 2026-12-01 (1일)' );
        expect( leaveTitle({ ...base, unit: LeaveUnit.HALF, endDate: '2026-12-01', startTime: '09:00', endTime: '13:00', quarters: 2 }) )
            .toBe( '[연차] 2026-12-01 반차 09:00~13:00 (0.5일)' );
    });
});
