//! 시설 예약 e2e (애드온 reservations, docs/design/features.md 6장)
// 실제 앱(AppModule) + 테스트 DB(intranet_test)로 API를 호출해 확인한다.
// ⭐ 핵심: 같은 시설·같은 시간에 동시에 요청해도 예약은 하나만 저장된다. (트랜잭션 검사 + DB exclusion constraint)
//
// 애드온 등록 여부는 app.module.ts를 처음 import할 때 한 번 정해지므로(addonModule이 @Module 평가 시점에 실행),
// .env.test의 ADDONS=reservations로 켜 둔다. 꺼진 경우는 맨 아래 테스트에서 모듈을 새로 불러와 확인한다.
//
// 날짜는 실행하는 날에 따라 달라지므로 "오늘부터 N일 뒤"로 만든다. 대부분은 24시간·매일 운영 분류로 시험하고,
// 운영 요일·시간 규칙은 평일 09:00~18:00 분류로 따로 확인한다.

// supertest의 res.body는 any 타입이다. 응답 형태는 각 expect에서 검사하므로 이 파일에서만 any 관련 규칙을 끈다.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { addKstDays, kstDateAt, kstDateString, kstIsoWeekday } from 'src/common/util/date.util';
import { FacilityReservationStatus, NotificationActionType, UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { isReservationOverlapError } from 'src/reservations/util/overlap-error.util';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

// KST 날짜 + "HH:mm" → ISO 문자열 (요청 본문용)
const at = ( date: string, hm: string ) => {
    const [ h, m ] = hm.split( ':' ).map( Number );
    return kstDateAt( date, h * 60 + m ).toISOString();
};
const daysFromToday = ( n: number ) => addKstDays( kstDateString( new Date() ), n );

// 오늘 이후 처음 오는 특정 요일 (ISO 1 = 월 … 7 = 일)
const nextWeekday = ( weekday: number ) => {
    for ( let n = 1; n <= 7; n++ ) {
        const date = daysFromToday( n );
        if ( kstIsoWeekday( kstDateAt( date, 0 ) ) === weekday ) return date;
    }
    throw new Error( 'unreachable' );
};

describe('시설 예약', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let http: () => ReturnType<typeof request>;

    let adminToken: string;
    let userToken: string;      // 예약자 A
    let otherToken: string;     // 다른 회원 B
    let userId: number;

    let allDayCategoryId: number;   // 24시간·매일·30분
    let weekdayCategoryId: number;  // 평일 09:00~18:00·30분
    let roomA: number;
    let roomB: number;
    let weekdayRoom: number;

    const auth = ( token: string ) => ({ Authorization: `Bearer ${token}` });

    const reserve = ( token: string, facilityId: number, date: string, start: string, end: string, title = '회의' ) =>
        http().post( '/reservations' ).set( auth( token ) ).send({ facilityId, startAt: at( date, start ), endAt: at( date, end ), title });

    beforeAll( async () => {
        app = await createTestApp();
        http = () => request( app.getHttpServer() );

        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const admin = await createTestUser( prisma, UserRole.ADMIN );
        const user = await createTestUser( prisma, UserRole.USER );
        const other = await createTestUser( prisma, UserRole.USER );
        userId = user.id;
        adminToken = await loginAs( app, admin.empNo );
        userToken = await loginAs( app, user.empNo );
        otherToken = await loginAs( app, other.empNo );

        const allDay = await http().post( '/reservations/categories' ).set( auth( adminToken ) ).send({
            name: '회의실', slotMinutes: 30, openTime: '00:00', closeTime: '24:00', operatingDays: [ 1, 2, 3, 4, 5, 6, 7 ], maxAdvanceDays: 90,
        }).expect( 201 );
        allDayCategoryId = allDay.body.id;

        const weekday = await http().post( '/reservations/categories' ).set( auth( adminToken ) ).send({
            name: '차량', slotMinutes: 30, openTime: '09:00', closeTime: '18:00', operatingDays: [ 1, 2, 3, 4, 5 ], maxAdvanceDays: 30,
        }).expect( 201 );
        weekdayCategoryId = weekday.body.id;

        roomA = ( await http().post( '/reservations/facilities' ).set( auth( adminToken ) ).send({ categoryId: allDayCategoryId, name: 'A' }).expect( 201 ) ).body.id;
        roomB = ( await http().post( '/reservations/facilities' ).set( auth( adminToken ) ).send({ categoryId: allDayCategoryId, name: 'B' }).expect( 201 ) ).body.id;
        weekdayRoom = ( await http().post( '/reservations/facilities' ).set( auth( adminToken ) ).send({ categoryId: weekdayCategoryId, name: '1호차' }).expect( 201 ) ).body.id;
    });

    afterAll( async () => {
        await app.close();
    });

    //* ⭐ 동시 예약
    describe('동시 예약', () => {
        // 같은 시설·같은 시간에 10명이 동시에 요청 → 1건만 201, 나머지 9건 409, DB에도 1건
        it('같은 시간에 동시에 10건을 요청해도 하나만 예약된다', async () => {
            const date = daysFromToday( 3 );
            const results = await Promise.all(
                Array.from( { length: 10 }, ( _, i ) => reserve( i % 2 ? userToken : otherToken, roomA, date, '10:00', '11:00' ) ),
            );

            const statuses = results.map( ( r ) => r.status ).sort();
            expect( statuses.filter( ( s ) => s === 201 ) ).toHaveLength( 1 );
            expect( statuses.filter( ( s ) => s === 409 ) ).toHaveLength( 9 );

            const saved = await prisma.facilityReservation.count({
                where: { facilityId: roomA, startAt: new Date( at( date, '10:00' ) ), status: FacilityReservationStatus.RESERVED, deleted: false },
            });
            expect( saved ).toBe( 1 );
        });

        // 서비스 검사를 거치지 않고 DB에 바로 넣어도 exclusion constraint가 막고, 그 오류를 409로 바꿀 수 있게 판별되는지
        // (동시 요청에서 "검사 통과 → 저장 실패"가 되는 경로를 직접 재현)
        it('DB 제약이 서비스 검사 없이도 겹침을 막고, 오류를 겹침으로 판별한다', async () => {
            const date = daysFromToday( 4 );
            const data = { facilityId: roomA, userId, startAt: new Date( at( date, '10:00' ) ), endAt: new Date( at( date, '11:00' ) ), createdId: userId, updatedId: userId };
            await prisma.facilityReservation.create({ data });

            const error = await prisma.facilityReservation.create({ data: { ...data, startAt: new Date( at( date, '10:30' ) ), endAt: new Date( at( date, '11:30' ) ) } })
                .then( () => null, ( e: unknown ) => e );

            expect( isReservationOverlapError( error ) ).toBe( true );
        });
    });

    //* 겹침 규칙
    describe('겹침', () => {
        // [시작, 종료): 10:00~11:00 뒤에 11:00~12:00은 겹치지 않는다.
        it('끝나는 시각에 시작하는 예약은 가능하다 ([) 경계)', async () => {
            const date = daysFromToday( 5 );
            await reserve( userToken, roomA, date, '10:00', '11:00' ).expect( 201 );
            await reserve( otherToken, roomA, date, '11:00', '12:00' ).expect( 201 );
        });

        it('같은 시설에서 30분이라도 겹치면 409', async () => {
            const date = daysFromToday( 5 );
            const res = await reserve( otherToken, roomA, date, '10:30', '11:30' ).expect( 409 );
            expect( res.body.message ).toContain( '이미 다른 예약' );
        });

        // 같은 분류의 다른 시설끼리는 같은 시간도 된다. (사용자 결정)
        it('다른 시설은 같은 시간에 예약할 수 있다', async () => {
            await reserve( otherToken, roomB, daysFromToday( 5 ), '10:00', '11:00' ).expect( 201 );
        });

        // 취소한 예약의 시간은 다시 예약할 수 있다. (DB 제약도 RESERVED만 본다)
        it('취소한 시간은 다시 예약할 수 있다', async () => {
            const date = daysFromToday( 6 );
            const first = await reserve( userToken, roomA, date, '14:00', '15:00' ).expect( 201 );
            await http().patch( `/reservations/${first.body.id}/cancel` ).set( auth( userToken ) ).expect( 200 );
            await reserve( otherToken, roomA, date, '14:00', '15:00' ).expect( 201 );
        });
    });

    //* 분류 규칙 (평일 09:00~18:00, 30분 단위, 30일 앞까지)
    describe('분류 규칙', () => {
        const weekday = nextWeekday( 3 );   // 다음 수요일
        const saturday = nextWeekday( 6 );

        it('규칙에 맞으면 201', async () => {
            await reserve( userToken, weekdayRoom, weekday, '09:00', '09:30' ).expect( 201 );
        });

        it.each([
            [ '운영하지 않는 요일(토)', () => [ saturday, '10:00', '11:00' ], '운영하지 않습니다' ],
            [ '운영 시간 밖', () => [ weekday, '17:30', '18:30' ], '운영 시간' ],
            [ '예약 단위가 안 맞음', () => [ weekday, '10:15', '11:00' ], '30분 단위' ],
            [ '예약 가능 기간(30일) 넘음', () => [ addKstDays( nextWeekday( 3 ), 35 ), '10:00', '11:00' ], '30일 뒤까지' ],
            [ '지난 날짜', () => [ daysFromToday( -1 ), '10:00', '11:00' ], '지난 시각' ],
        ])( '%s → 400', async ( _label, input, message ) => {
            const [ date, start, end ] = input();
            const res = await reserve( userToken, weekdayRoom, date, start, end ).expect( 400 );
            expect( res.body.message ).toContain( message );
        });
    });

    //* 사용 불가 기간
    describe('사용 불가 기간', () => {
        // 겹치는 예약이 있어도 저장하고 경고만 준다. 기존 예약은 그대로 RESERVED. (사용자 결정)
        it('겹치는 예약이 있어도 저장하고 conflicts로 경고, 기존 예약은 그대로', async () => {
            const date = daysFromToday( 7 );
            const existing = await reserve( userToken, roomB, date, '13:00', '14:00' ).expect( 201 );

            const res = await http().post( `/reservations/facilities/${roomB}/unavailable` ).set( auth( adminToken ) )
                .send({ startAt: at( date, '12:00' ), endAt: at( date, '16:00' ), reason: '점검' })
                .expect( 201 );

            expect( res.body.conflicts.map( ( c: { id: number } ) => c.id ) ).toEqual([ existing.body.id ]);
            const after = await prisma.facilityReservation.findUniqueOrThrow({ where: { id: existing.body.id } });
            expect( after.status ).toBe( FacilityReservationStatus.RESERVED );
        });

        it('사용 불가 기간에는 새 예약을 받지 않는다 (409)', async () => {
            const res = await reserve( otherToken, roomB, daysFromToday( 7 ), '15:00', '15:30' ).expect( 409 );
            expect( res.body.message ).toContain( '사용 불가' );
        });

        it('일반 회원은 사용 불가 기간을 등록할 수 없다 (403)', async () => {
            await http().post( `/reservations/facilities/${roomB}/unavailable` ).set( auth( userToken ) )
                .send({ startAt: at( daysFromToday( 8 ), '12:00' ), endAt: at( daysFromToday( 8 ), '13:00' ) })
                .expect( 403 );
        });
    });

    //* 반복 예약
    describe('반복 예약', () => {
        // 4일 매일 예약: 둘째 날은 이미 예약됨, 셋째 날은 사용 불가 → 2건 생성, 2건 건너뜀(이유 포함)
        it('이미 예약된 날·사용 불가 기간은 건너뛰고 나머지만 만든다', async () => {
            const [ d1, d2, d3, d4 ] = [ 10, 11, 12, 13 ].map( daysFromToday );
            await reserve( otherToken, roomA, d2, '09:30', '10:30' ).expect( 201 );
            await http().post( `/reservations/facilities/${roomA}/unavailable` ).set( auth( adminToken ) )
                .send({ startAt: at( d3, '00:00' ), endAt: at( d4, '00:00' ) }).expect( 201 );

            const res = await http().post( '/reservations/recurring' ).set( auth( userToken ) ).send({
                facilityId: roomA, startDate: d1, endDate: d4, weekdays: [ 1, 2, 3, 4, 5, 6, 7 ], startTime: '09:00', endTime: '10:00', title: '주간 회의',
            }).expect( 201 );

            expect( res.body.created.map( ( r: { startAt: string } ) => kstDateString( new Date( r.startAt ) ) ) ).toEqual([ d1, d4 ]);
            expect( res.body.skipped ).toEqual([ { date: d2, reason: 'RESERVED' }, { date: d3, reason: 'UNAVAILABLE' } ]);
        });

        // 평일만 운영하는 분류에 매일 반복 → 주말은 NOT_OPERATING_DAY로 건너뜀
        it('운영하지 않는 요일은 건너뛴다', async () => {
            const monday = nextWeekday( 1 );
            const res = await http().post( '/reservations/recurring' ).set( auth( userToken ) ).send({
                facilityId: weekdayRoom, startDate: addKstDays( monday, -2 ), endDate: monday, weekdays: [ 1, 2, 3, 4, 5, 6, 7 ], startTime: '11:00', endTime: '12:00',
            }).expect( 201 );

            expect( res.body.created ).toHaveLength( 1 );
            expect( res.body.skipped.map( ( s: { reason: string } ) => s.reason ) ).toEqual([ 'NOT_OPERATING_DAY', 'NOT_OPERATING_DAY' ]);
        });

        // 시간대 자체가 규칙에 안 맞으면 모든 날짜가 같으므로 전체 거부
        it('시간대가 운영 시간 밖이면 전체 400', async () => {
            await http().post( '/reservations/recurring' ).set( auth( userToken ) ).send({
                facilityId: weekdayRoom, startDate: daysFromToday( 1 ), endDate: daysFromToday( 7 ), weekdays: [ 1, 2, 3, 4, 5 ], startTime: '08:00', endTime: '09:00',
            }).expect( 400 );
        });

        // 반복 예약은 묶음 정보가 없으므로 여러 건 취소는 일괄 취소로 한다.
        it('만든 예약들을 일괄 취소할 수 있다', async () => {
            const res = await http().post( '/reservations/recurring' ).set( auth( userToken ) ).send({
                facilityId: roomB, startDate: daysFromToday( 20 ), endDate: daysFromToday( 22 ), weekdays: [ 1, 2, 3, 4, 5, 6, 7 ], startTime: '09:00', endTime: '09:30',
            }).expect( 201 );
            const ids = res.body.created.map( ( r: { id: number } ) => r.id );

            await http().patch( '/reservations/bulk/cancel' ).set( auth( userToken ) ).send({ ids }).expect( 200 );

            const statuses = await prisma.facilityReservation.findMany({ where: { id: { in: ids } }, select: { status: true } });
            expect( statuses.every( ( s ) => s.status === FacilityReservationStatus.CANCELLED ) ).toBe( true );
        });

        // 남의 예약이 하나라도 섞이면 전체 실패 (기존 일괄 처리 규칙)
        it('일괄 취소에 남의 예약이 섞이면 전체 실패', async () => {
            const mine = await reserve( userToken, roomB, daysFromToday( 25 ), '09:00', '09:30' ).expect( 201 );
            const others = await reserve( otherToken, roomB, daysFromToday( 25 ), '10:00', '10:30' ).expect( 201 );

            await http().patch( '/reservations/bulk/cancel' ).set( auth( userToken ) ).send({ ids: [ mine.body.id, others.body.id ] }).expect( 403 );

            const row = await prisma.facilityReservation.findUniqueOrThrow({ where: { id: mine.body.id } });
            expect( row.status ).toBe( FacilityReservationStatus.RESERVED );
        });
    });

    //* 권한 (본인·관리자, 시작 전/후)
    describe('권한', () => {
        let futureId: number;
        let startedId: number;

        beforeAll( async () => {
            futureId = ( await reserve( userToken, roomB, daysFromToday( 30 ), '09:00', '10:00' ).expect( 201 ) ).body.id;

            // 이미 시작한 예약은 API로 만들 수 없으므로 DB에 직접 넣는다. (지난 예약)
            startedId = ( await prisma.facilityReservation.create({
                data: { facilityId: roomB, userId, startAt: new Date( Date.now() - 30 * 60000 ), endAt: new Date( Date.now() + 30 * 60000 ), createdId: userId, updatedId: userId },
            }) ).id;
        });

        it('다른 회원은 수정·취소·삭제할 수 없다 (403)', async () => {
            await http().patch( `/reservations/${futureId}` ).set( auth( otherToken ) ).send({ title: 'x' }).expect( 403 );
            await http().patch( `/reservations/${futureId}/cancel` ).set( auth( otherToken ) ).expect( 403 );
            await http().delete( `/reservations/${futureId}` ).set( auth( otherToken ) ).expect( 403 );
        });

        it('본인은 시작 전 예약의 시간을 바꿀 수 있고, 바꾼 시간으로 겹침을 다시 본다', async () => {
            const res = await http().patch( `/reservations/${futureId}` ).set( auth( userToken ) )
                .send({ startAt: at( daysFromToday( 30 ), '10:00' ), endAt: at( daysFromToday( 30 ), '11:00' ) })
                .expect( 200 );
            expect( kstDateString( new Date( res.body.startAt ) ) ).toBe( daysFromToday( 30 ) );
        });

        // 지난 예약(시작 후): 본인은 아무것도 못 하고, 관리자는 삭제만 (사용자 결정)
        it('시작된 예약: 본인은 수정·취소·삭제 불가', async () => {
            await http().patch( `/reservations/${startedId}` ).set( auth( userToken ) ).send({ title: 'x' }).expect( 403 );
            await http().patch( `/reservations/${startedId}/cancel` ).set( auth( userToken ) ).expect( 403 );
            await http().delete( `/reservations/${startedId}` ).set( auth( userToken ) ).expect( 403 );
        });

        it('시작된 예약: 관리자는 취소 불가, 삭제만 가능', async () => {
            await http().patch( `/reservations/${startedId}/cancel` ).set( auth( adminToken ) ).expect( 403 );
            await http().delete( `/reservations/${startedId}` ).set( auth( adminToken ) ).expect( 200 );
        });

        // 관리자가 남의 예약을 취소·삭제하면 예약자에게 알림 (사용자 결정)
        it('관리자가 남의 예약을 취소·삭제하면 예약자에게 알림이 간다', async () => {
            await http().patch( `/reservations/${futureId}/cancel` ).set( auth( adminToken ) ).expect( 200 );

            const notifications = await prisma.notification.findMany({ where: { userId }, select: { actionType: true, targetId: true } });
            expect( notifications ).toEqual( expect.arrayContaining([
                { actionType: NotificationActionType.RESERVATION_CANCELLED_BY_ADMIN, targetId: futureId },
                { actionType: NotificationActionType.RESERVATION_DELETED_BY_ADMIN, targetId: startedId },
            ]) );
        });

        // 본인이 직접 취소하면 알림을 보내지 않는다.
        it('본인이 취소하면 알림이 없다', async () => {
            const own = await reserve( otherToken, roomB, daysFromToday( 31 ), '09:00', '10:00' ).expect( 201 );
            await http().patch( `/reservations/${own.body.id}/cancel` ).set( auth( otherToken ) ).expect( 200 );

            expect( await prisma.notification.count({ where: { targetId: own.body.id } }) ).toBe( 0 );
        });

        // 관리자가 남의 예약 시간을 바꾸면 예약자에게 알림 (바뀌기 전 → 후 시간). 제목만 고치면 보내지 않는다. (사용자 결정)
        it('관리자가 남의 예약 시간을 바꾸면 예약자에게 알림, 제목만 바꾸면 없음', async () => {
            const date = daysFromToday( 32 );
            const target = await reserve( userToken, roomB, date, '09:00', '10:00' ).expect( 201 );

            await http().patch( `/reservations/${target.body.id}` ).set( auth( adminToken ) ).send({ title: '이름만 변경' }).expect( 200 );
            expect( await prisma.notification.count({ where: { targetId: target.body.id } }) ).toBe( 0 );

            await http().patch( `/reservations/${target.body.id}` ).set( auth( adminToken ) )
                .send({ startAt: at( date, '13:00' ), endAt: at( date, '14:00' ) }).expect( 200 );

            const notification = await prisma.notification.findFirstOrThrow({ where: { targetId: target.body.id } });
            expect( notification ).toMatchObject({ userId, actionType: NotificationActionType.RESERVATION_UPDATED_BY_ADMIN });
            expect( notification.content ).toBe( `[B] ${date} 09:00~10:00 → ${date} 13:00~14:00` );
        });

        // 본인이 자기 예약 시간을 바꾸면 알림 없음
        it('본인이 시간을 바꾸면 알림이 없다', async () => {
            const date = daysFromToday( 33 );
            const own = await reserve( userToken, roomB, date, '09:00', '10:00' ).expect( 201 );

            await http().patch( `/reservations/${own.body.id}` ).set( auth( userToken ) )
                .send({ startAt: at( date, '11:00' ), endAt: at( date, '12:00' ) }).expect( 200 );
            expect( await prisma.notification.count({ where: { targetId: own.body.id } }) ).toBe( 0 );
        });
    });

    //* 시설·분류 관리
    describe('시설·분류 관리', () => {
        it('시설이 남은 분류는 삭제할 수 없다 (409)', async () => {
            await http().delete( `/reservations/categories/${allDayCategoryId}` ).set( auth( adminToken ) ).expect( 409 );
        });

        it('앞으로의 예약이 있는 시설은 삭제할 수 없다 (409)', async () => {
            await http().delete( `/reservations/facilities/${roomA}` ).set( auth( adminToken ) ).expect( 409 );
        });

        // 사용 안 함: 새 예약만 막고 기존 예약은 유지 (사용자 결정)
        it('사용 안 함으로 바꾸면 새 예약은 400, 기존 예약은 그대로', async () => {
            const before = await prisma.facilityReservation.count({ where: { facilityId: weekdayRoom, status: FacilityReservationStatus.RESERVED, deleted: false } });

            await http().patch( `/reservations/facilities/${weekdayRoom}` ).set( auth( adminToken ) ).send({ isActive: false }).expect( 200 );
            await reserve( userToken, weekdayRoom, nextWeekday( 4 ), '10:00', '11:00' ).expect( 400 );

            const after = await prisma.facilityReservation.count({ where: { facilityId: weekdayRoom, status: FacilityReservationStatus.RESERVED, deleted: false } });
            expect( after ).toBe( before );
        });

        it('운영 시간이 예약 단위로 나누어떨어지지 않는 분류는 만들 수 없다 (400)', async () => {
            await http().post( '/reservations/categories' ).set( auth( adminToken ) ).send({
                name: '장비', slotMinutes: 40, openTime: '09:00', closeTime: '18:00', operatingDays: [ 1 ], maxAdvanceDays: 10,
            }).expect( 400 );
        });

        it('일반 회원은 분류·시설을 만들 수 없다 (403)', async () => {
            await http().post( '/reservations/facilities' ).set( auth( userToken ) ).send({ categoryId: allDayCategoryId, name: 'C' }).expect( 403 );
        });
    });

    //* 조회
    describe('조회', () => {
        // 'reservations/:id'가 고정 경로(categories, facilities)를 가로채지 않는지 (컨트롤러 등록 순서)
        it('GET /reservations/categories·facilities가 :id로 잡히지 않는다', async () => {
            const categories = await http().get( '/reservations/categories' ).set( auth( userToken ) ).expect( 200 );
            expect( categories.body[0] ).toMatchObject({ name: '회의실', openTime: '00:00', closeTime: '24:00' });
            await http().get( '/reservations/facilities' ).set( auth( userToken ) ).expect( 200 );
        });

        // 시간표에는 제목·예약자 이름이 공개된다. (사용자 결정) 내 예약은 isMine
        it('시간표: 제목·예약자 이름·isMine, 사용 불가 기간 포함', async () => {
            const date = daysFromToday( 7 );
            const res = await http().get( '/reservations/schedule' ).set( auth( otherToken ) )
                .query({ facilityId: roomB, from: at( date, '00:00' ), to: at( addKstDays( date, 1 ), '00:00' ) })
                .expect( 200 );

            expect( res.body.reservations[0] ).toMatchObject({ title: '회의', isMine: false, user: { id: userId } });
            expect( res.body.unavailable ).toHaveLength( 1 );
        });

        it('시간표는 31일까지만 조회할 수 있다 (400)', async () => {
            await http().get( '/reservations/schedule' ).set( auth( userToken ) )
                .query({ categoryId: allDayCategoryId, from: at( daysFromToday( 0 ), '00:00' ), to: at( daysFromToday( 32 ), '00:00' ) })
                .expect( 400 );
        });

        it('내 예약에는 본인 예약만 나온다', async () => {
            const res = await http().get( '/reservations/me' ).set( auth( userToken ) ).query({ take: 100 }).expect( 200 );
            expect( res.body.data.length ).toBeGreaterThan( 0 );
            expect( res.body.data.every( ( r: { userId: number } ) => r.userId === userId ) ).toBe( true );
        });
    });

    //* 애드온이 꺼지면 API 자체가 없다
    // AppModule이 ReservationsModule을 addonModule()로 감싸 등록했는지 확인한다. (그냥 imports에 넣으면 항상 켜져 여기서 실패)
    // 등록 여부는 import 시점에 정해지므로, ADDONS를 비운 뒤 모듈 캐시를 분리해 app.module을 새로 불러온다.
    it('ADDONS에 reservations가 없으면 404', async () => {
        const original = process.env.ADDONS;
        process.env.ADDONS = '';

        try {
            await jest.isolateModulesAsync( async () => {
                // isolateModules 안의 require는 새 모듈 캐시에서 불러온다. (파일 위에서 불러온 AppModule과 다른 인스턴스)
                /* eslint-disable @typescript-eslint/no-require-imports */
                const { AppModule: FreshAppModule } = require( 'src/app.module' ) as typeof import( 'src/app.module' );
                const { createTestApp: freshCreateTestApp } = require( './utils/app' ) as typeof import( './utils/app' );
                /* eslint-enable @typescript-eslint/no-require-imports */
                const offApp = await freshCreateTestApp( [], FreshAppModule );

                await request( offApp.getHttpServer() ).get( '/reservations/categories' ).set( auth( userToken ) ).expect( 404 );
                await request( offApp.getHttpServer() ).post( '/reservations' ).set( auth( userToken ) ).send( {} ).expect( 404 );

                await offApp.close();
            });
        } finally {
            process.env.ADDONS = original;
        }
    });
});
