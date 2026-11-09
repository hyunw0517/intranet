//! reservation-rules.util.ts 단위 테스트
// 시설 예약 시간이 분류 규칙(예약 단위·운영 시간·운영 요일·예약 가능 기간)에 맞는지 판단하는 함수들을 확인한다.
// 모든 시각은 한국 시간(+09:00)으로 적는다. 서버가 UTC로 돌아도 KST 기준으로 판단하는지가 핵심이다.
// DB를 쓰지 않는다. 규칙 객체와 시각을 넣고 결과(위반 코드)를 비교한다.

import {
    checkCategorySettings, checkReservationTime, formatHm, lastBookableDate, listRecurringDates, parseHm, ReservationRules,
} from './reservation-rules.util';

// 테스트 기준 규칙: 30분 단위, 09:00~18:00, 월~금, 90일 앞까지 (분류 기본값과 같음)
const rules: ReservationRules = { slotMinutes: 30, openMinute: 540, closeMinute: 1080, operatingDays: [ 1, 2, 3, 4, 5 ], maxAdvanceDays: 90 };

// "지금" = 2026-11-10(화) 08:00 KST
const NOW = new Date( '2026-11-10T08:00:00+09:00' );
const kst = ( s: string ) => new Date( `${s}+09:00` );
const check = ( start: string, end: string, r: ReservationRules = rules ) => checkReservationTime( kst( start ), kst( end ), r, NOW )?.code ?? null;

//* "HH:mm" ↔ 분 (분류 운영 시간 입력·응답용)
describe('parseHm / formatHm', () => {
    it('"HH:mm"을 자정부터의 분으로 바꾸고 되돌린다', () => {
        expect( parseHm( '09:30' ) ).toBe( 570 );
        expect( formatHm( 570 ) ).toBe( '09:30' );
    });

    // 하루 끝까지 운영하는 시설(24시간)을 위해 "24:00"은 허용하고, 그 이상·잘못된 형식은 null
    it('"24:00"까지 허용하고 범위를 넘거나 형식이 틀리면 null', () => {
        expect( parseHm( '24:00' ) ).toBe( 1440 );
        expect( formatHm( 1440 ) ).toBe( '24:00' );
        expect( parseHm( '24:30' ) ).toBeNull();
        expect( parseHm( '09:60' ) ).toBeNull();
        expect( parseHm( '9:00' ) ).toBeNull();
    });
});

//* 분류 설정 검사 (관리자가 분류를 만들거나 고칠 때)
describe('checkCategorySettings', () => {
    it('정상 설정이면 null', () => {
        expect( checkCategorySettings({ slotMinutes: 30, openMinute: 540, closeMinute: 1080 }) ).toBeNull();
    });

    it('운영 종료가 시작보다 앞이거나 같으면 오류', () => {
        expect( checkCategorySettings({ slotMinutes: 30, openMinute: 600, closeMinute: 600 }) ).toContain( '뒤여야' );
    });

    // 09:00~18:00을 40분 단위로 나누면 마지막 칸(17:40~18:20)이 운영 시간을 넘어 잘린다 → 설정 단계에서 막는다.
    it('운영 시간이 예약 단위로 나누어떨어지지 않으면 오류', () => {
        expect( checkCategorySettings({ slotMinutes: 40, openMinute: 540, closeMinute: 1080 }) ).toContain( '나누어떨어져야' );
    });
});

//* 예약 시간 검사 (단건 예약·수정·반복 예약의 날짜마다)
describe('checkReservationTime', () => {
    it('규칙에 맞으면 null', () => {
        expect( check( '2026-11-10T10:00:00', '2026-11-10T11:00:00' ) ).toBeNull();
    });

    // [시작, 종료) 범위라 운영 종료 18:00에 "끝나는" 예약은 가능하다. 운영 시작 09:00에 시작하는 것도 가능.
    it('운영 시작에 시작하고 운영 종료에 끝나는 예약은 가능하다 (경계 포함)', () => {
        expect( check( '2026-11-10T09:00:00', '2026-11-10T09:30:00' ) ).toBeNull();
        expect( check( '2026-11-10T17:30:00', '2026-11-10T18:00:00' ) ).toBeNull();
    });

    it.each([
        [ '종료가 시작과 같음', '2026-11-10T10:00:00', '2026-11-10T10:00:00', 'INVALID_RANGE' ],
        [ '종료가 시작보다 앞', '2026-11-10T11:00:00', '2026-11-10T10:00:00', 'INVALID_RANGE' ],
        [ '이미 지난 시각 (어제)', '2026-11-09T10:00:00', '2026-11-09T11:00:00', 'PAST' ],
        [ '지금과 같은 시각에 시작', '2026-11-10T08:00:00', '2026-11-10T09:00:00', 'PAST' ],
        [ '다음 날로 넘어감', '2026-11-10T17:00:00', '2026-11-11T09:30:00', 'MULTI_DAY' ],
        [ '토요일', '2026-11-14T10:00:00', '2026-11-14T11:00:00', 'NOT_OPERATING_DAY' ],
        [ '운영 시작 전', '2026-11-10T08:30:00', '2026-11-10T09:30:00', 'OUTSIDE_HOURS' ],
        [ '운영 종료 후까지', '2026-11-10T17:30:00', '2026-11-10T18:30:00', 'OUTSIDE_HOURS' ],
        [ '단위에 안 맞는 시작 (10:15)', '2026-11-10T10:15:00', '2026-11-10T11:00:00', 'SLOT' ],
        [ '단위에 안 맞는 종료 (10:50)', '2026-11-10T10:00:00', '2026-11-10T10:50:00', 'SLOT' ],
        [ '초 단위가 섞임', '2026-11-10T10:00:30', '2026-11-10T11:00:00', 'SLOT' ],
        [ '예약 가능 기간(90일) 다음 날', '2027-02-09T10:00:00', '2027-02-09T11:00:00', 'TOO_FAR' ],
    ])( '%s → %s', ( _label, start, end, code ) => {
        expect( check( start, end ) ).toBe( code );
    });

    // 오늘(11/10) + 90일 = 2027-02-08(월) → 그날까지는 예약 가능
    it('예약 가능 기간의 마지막 날은 가능하다', () => {
        expect( lastBookableDate( rules, NOW ) ).toBe( '2027-02-08' );
        expect( check( '2027-02-08T10:00:00', '2027-02-08T11:00:00' ) ).toBeNull();
    });

    // ⭐ 시간대 함정: KST 11/11(수) 00:30은 UTC로는 11/10(화) 15:30이다. 요일·날짜를 KST로 판단해야 한다.
    // 24시간 운영(00:00~24:00), 수요일만 운영하는 분류로 확인
    it('요일은 UTC가 아니라 KST 날짜로 판단한다', () => {
        const wednesdayOnly: ReservationRules = { ...rules, openMinute: 0, closeMinute: 1440, operatingDays: [ 3 ] };

        expect( check( '2026-11-11T00:30:00', '2026-11-11T01:00:00', wednesdayOnly ) ).toBeNull();
    });

    // 24시간 운영이면 23:30~24:00(= 다음 날 00:00)까지 하루 안의 예약으로 본다.
    it('24시간 운영이면 자정에 끝나는 예약은 하루 안이다', () => {
        const allDay: ReservationRules = { ...rules, openMinute: 0, closeMinute: 1440 };

        expect( check( '2026-11-10T23:30:00', '2026-11-11T00:00:00', allDay ) ).toBeNull();
        expect( check( '2026-11-10T23:30:00', '2026-11-11T00:30:00', allDay ) ).toBe( 'MULTI_DAY' );
    });
});

//* 반복 예약 날짜 목록
describe('listRecurringDates', () => {
    // 2026-11-09(월) ~ 11-22(일) 중 월·수 → 4일
    it('기간 중 고른 요일인 날짜만 오름차순으로 돌려준다', () => {
        expect( listRecurringDates( '2026-11-09', '2026-11-22', [ 1, 3 ] ) ).toEqual([ '2026-11-09', '2026-11-11', '2026-11-16', '2026-11-18' ]);
    });

    // 모든 요일 = 매일. 운영하지 않는 요일(주말)도 목록에는 넣는다 → 서비스가 "건너뜀(NOT_OPERATING_DAY)"으로 응답
    it('모든 요일을 고르면 매일, 주말도 포함한다', () => {
        expect( listRecurringDates( '2026-11-13', '2026-11-16', [ 1, 2, 3, 4, 5, 6, 7 ] ) ).toEqual([ '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16' ]);
    });

    // 월말·연말을 넘어가도 날짜 계산이 맞는지
    it('월·연도가 바뀌어도 이어진다', () => {
        expect( listRecurringDates( '2026-12-30', '2027-01-02', [ 1, 2, 3, 4, 5, 6, 7 ] ) ).toEqual([ '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02' ]);
    });

    it('시작일과 종료일이 같으면 그날 하루 (요일이 맞을 때)', () => {
        expect( listRecurringDates( '2026-11-10', '2026-11-10', [ 2 ] ) ).toEqual([ '2026-11-10' ]);
        expect( listRecurringDates( '2026-11-10', '2026-11-10', [ 3 ] ) ).toEqual( [] );
    });
});
