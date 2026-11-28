//! 로그인 실패 잠금 · IP 요청 수 제한 e2e (features.md)
// - 계정(사번) 기준: 5회 연속 실패마다 잠금. 단계별 10분 → 30분 → 1시간(최대). 잠긴 동안은 맞는 비밀번호도 429
// - 실패 메시지는 원인(없는 사번 / 틀린 비밀번호)과 무관하게 같다. 없는 사번도 같은 방식으로 센다
// - 로그인 성공·관리자 해제(PATCH /auth/unlock/:userId)는 기록을 지워 단계를 처음부터 다시 센다
// - IP 요청 수 제한: 로그인 라우트에 1분 AUTH_THROTTLE_LIMIT회. 넘으면 비밀번호를 확인하기 전에 429 (감사 로그도 남지 않음)
//
// 요청 수 제한 카운터는 앱(서버 메모리)마다 따로 있다. 한 앱에서 로그인 요청이 한도를 넘지 않도록 묶음(describe)마다 앱을 새로 띄운다.
// 잠금 시간(10분·30분)은 기다릴 수 없으므로, 단계·시각은 LoginHistory 행을 직접 고쳐 만든다.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AUTH_THROTTLE_LIMIT, LOGIN_FAILED_MESSAGE } from 'src/auth/const/login-lock.const';
import { AuditActionType, UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs, TEST_PASSWORD } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

const WRONG_PASSWORD = 'Wrong1234!';
const MINUTE = 60 * 1000;
const SETUP_TIMEOUT = 30000; // 앱 기동 + 준비 (전체 e2e를 함께 돌리면 기본 5초를 넘길 수 있다)

describe('로그인 실패 잠금 · IP 요청 수 제한', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    const http = () => request( app.getHttpServer() );
    const login = ( empNo: string, password = TEST_PASSWORD ) => {
        const basic = Buffer.from( `${empNo}:${password}` ).toString( 'base64' );
        return http().post( '/auth/login/emp' ).set( 'Authorization', `Basic ${basic}` );
    };

    const historyOf = ( empNo: string ) => prisma.loginHistory.findUnique({ where: { empNo } });
    const messageOf = ( res: { body: unknown } ) => ( res.body as { message: string } ).message;
    const countAudit = ( actionType: AuditActionType, targetId?: number ) => prisma.audit.count({ where: { actionType, targetId } });

    // 잠금이 끝나는 시각까지 남은 분 (요청 처리 시간 몇 ms는 반올림으로 지운다)
    const minutesLeft = ( until: Date | null | undefined ) => Math.round( ( ( until?.getTime() ?? 0 ) - Date.now() ) / MINUTE );

    // 묶음마다 새 앱 + 빈 DB (요청 수 제한 카운터도 새로 시작)
    const startApp = async () => {
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );
    };

    describe('실패 횟수와 잠금', () => {
        let user: { id: number; empNo: string };

        beforeAll( async () => {
            await startApp();
            user = await createTestUser( prisma, UserRole.USER );
        }, SETUP_TIMEOUT );

        afterAll( async () => {
            await app.close();
        });

        it('4회까지는 401이고, 실패 횟수만 쌓인다', async () => {
            for ( let i = 0; i < 4; i++ ) {
                const res = await login( user.empNo, WRONG_PASSWORD ).expect( 401 );
                expect( messageOf( res ) ).toBe( LOGIN_FAILED_MESSAGE );
            }

            const history = await historyOf( user.empNo );
            expect( history ).toMatchObject({ userId: user.id, failCount: 4, lockLevel: 0, lockedUntil: null });
        });

        it('5회째 실패하면 1단계(10분) 잠금 → 429, 감사 로그에 잠금을 남긴다', async () => {
            const res = await login( user.empNo, WRONG_PASSWORD ).expect( 429 );
            expect( messageOf( res ) ).toContain( '10분' );

            // 잠기면 실패 횟수는 0으로 돌아가고 단계가 오른다 (다음 잠금까지 다시 5회)
            const history = await historyOf( user.empNo );
            expect( history ).toMatchObject({ failCount: 0, lockLevel: 1 });
            expect( minutesLeft( history?.lockedUntil ) ).toBe( 10 );

            expect( await countAudit( AuditActionType.LOGIN_FAILED, user.id ) ).toBe( 5 );
            expect( await countAudit( AuditActionType.LOGIN_LOCKED, user.id ) ).toBe( 1 );
        });

        it('잠긴 동안은 맞는 비밀번호도 429이고, 그 시도는 기록하지 않는다', async () => {
            await login( user.empNo ).expect( 429 );

            // 비밀번호를 확인하지 않으므로 실패로도 세지 않는다
            expect( await countAudit( AuditActionType.LOGIN_FAILED, user.id ) ).toBe( 5 );
            expect( await historyOf( user.empNo ) ).toMatchObject({ failCount: 0, lockLevel: 1 });
        });

        it('없는 사번도 같은 메시지로 401이고, 같은 방식으로 센다 (등록된 사번을 알아낼 수 없게)', async () => {
            const res = await login( 'NOBODY01', WRONG_PASSWORD ).expect( 401 );
            expect( messageOf( res ) ).toBe( LOGIN_FAILED_MESSAGE );

            expect( await historyOf( 'NOBODY01' ) ).toMatchObject({ userId: null, failCount: 1 });
        });
    });

    describe('잠금 단계 · 초기화', () => {
        let user: { id: number; empNo: string };
        let adminToken = '';

        // 잠금 상태를 직접 만든다 (lockedUntil이 지난 시각이면 "잠금이 끝난 상태")
        const setHistory = ( data: { failCount: number; lockLevel: number; lockedUntil: Date | null } ) =>
            prisma.loginHistory.upsert({
                where: { empNo: user.empNo },
                create: { empNo: user.empNo, userId: user.id, lastFailedAt: new Date(), ...data },
                update: data,
            });
        const past = () => new Date( Date.now() - MINUTE );

        beforeAll( async () => {
            await startApp();
            user = await createTestUser( prisma, UserRole.USER );
            const admin = await createTestUser( prisma, UserRole.ADMIN );
            adminToken = await loginAs( app, admin.empNo );
        }, SETUP_TIMEOUT );

        afterAll( async () => {
            await app.close();
        });

        it('1단계 잠금이 끝난 뒤 다시 5회째 실패하면 2단계(30분)', async () => {
            await setHistory({ failCount: 4, lockLevel: 1, lockedUntil: past() });

            const res = await login( user.empNo, WRONG_PASSWORD ).expect( 429 );
            expect( messageOf( res ) ).toContain( '30분' );

            const history = await historyOf( user.empNo );
            expect( history?.lockLevel ).toBe( 2 );
            expect( minutesLeft( history?.lockedUntil ) ).toBe( 30 );
        });

        it('3단계부터는 1시간에서 더 늘지 않는다 (남이 일부러 잠가도 피해 시간을 제한)', async () => {
            await setHistory({ failCount: 4, lockLevel: 3, lockedUntil: past() });

            await login( user.empNo, WRONG_PASSWORD ).expect( 429 );

            const history = await historyOf( user.empNo );
            expect( history?.lockLevel ).toBe( 3 );
            expect( minutesLeft( history?.lockedUntil ) ).toBe( 60 );
        });

        it('잠금이 끝나면 맞는 비밀번호로 로그인되고, 기록을 지워 단계가 처음부터 다시 시작된다', async () => {
            await setHistory({ failCount: 2, lockLevel: 2, lockedUntil: past() });

            await login( user.empNo ).expect( 201 );

            expect( await historyOf( user.empNo ) ).toBeNull();
        });

        it('관리자가 해제하면 잠금 시간이 남아 있어도 바로 로그인된다', async () => {
            await setHistory({ failCount: 0, lockLevel: 1, lockedUntil: new Date( Date.now() + 10 * MINUTE ) });
            await login( user.empNo ).expect( 429 );

            const unlock = () => http().patch( `/auth/unlock/${user.id}` ).set( 'Authorization', `Bearer ${adminToken}` );
            expect( ( await unlock().expect( 200 ) ).body ).toEqual({ unlocked: true });
            expect( ( await unlock().expect( 200 ) ).body ).toEqual({ unlocked: false }); // 잠긴 적이 없으면 오류가 아니라 false

            await login( user.empNo ).expect( 201 );
            expect( await countAudit( AuditActionType.LOGIN_UNLOCKED, user.id ) ).toBe( 1 );
        });
    });

    describe('IP 요청 수 제한', () => {
        let user: { id: number; empNo: string };

        beforeAll( async () => {
            await startApp();
            user = await createTestUser( prisma, UserRole.USER );
        }, SETUP_TIMEOUT );

        afterAll( async () => {
            await app.close();
        });

        // 사번마다 한 번씩 시도하는 공격은 계정 잠금으로 막을 수 없어 IP 기준으로 함께 막는다.
        it('같은 IP에서 1분에 한도(AUTH_THROTTLE_LIMIT)까지만 받고, 그다음은 비밀번호를 확인하기 전에 429', async () => {
            for ( let i = 1; i <= AUTH_THROTTLE_LIMIT; i++ ) {
                await login( `NOBODY${String( i ).padStart( 3, '0' )}`, WRONG_PASSWORD ).expect( 401 );
            }

            // 맞는 비밀번호여도 거부된다
            const res = await login( user.empNo ).expect( 429 );
            expect( messageOf( res ) ).toBe( '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' );

            // 한도를 넘은 요청은 로그인 처리까지 가지 않았으므로 실패 기록·감사 로그가 없다
            expect( await countAudit( AuditActionType.LOGIN_FAILED ) ).toBe( AUTH_THROTTLE_LIMIT );
            expect( await historyOf( user.empNo ) ).toBeNull();
        }, 120000 ); // 한도만큼 로그인 요청을 보내므로 기본 5초로는 부족하다
    });
});
