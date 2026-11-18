//! 공휴일 API e2e - 외부 API는 호출하지 않고 fetch를 대체한다.
// - 권한, 연도 범위, 연도별 캐시, 동시 요청 합치기, 외부 API 실패 시 동작

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { HolidaysService } from 'src/common/holidays.service';
import { UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

const HOUR = 60 * 60 * 1000;
const thisYear = Number( new Intl.DateTimeFormat( 'en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' } ).format( new Date() ) );

const okXml = ( year: number ) => `<response><header><resultCode>00</resultCode></header><body><items>
    <item><dateName>신정</dateName><isHoliday>Y</isHoliday><locdate>${year}0101</locdate></item>
    <item><dateName>기념일</dateName><isHoliday>N</isHoliday><locdate>${year}0102</locdate></item>
</items></body></response>`;
const holidays = ( year: number ) => [ { date: `${year}-01-01`, name: '신정' } ];

describe('공휴일 API', () => {
    const originalKey = process.env.HOLIDAY_API_KEY;

    let app: INestApplication<App>;
    let service: HolidaysService;
    let userToken: string;
    let guestToken: string;
    let fetchMock: jest.SpiedFunction<typeof fetch>;

    const get = ( query: string, token = userToken ) =>
        request( app.getHttpServer() ).get( `/common/holidays?${query}` ).set( 'Authorization', `Bearer ${token}` );

    beforeAll( async () => {
        process.env.HOLIDAY_API_KEY = 'test%2Fkey';
        app = await createTestApp();
        service = app.get( HolidaysService );

        const prisma = app.get( PrismaService );
        await resetDatabase( prisma );
        userToken = await loginAs( app, ( await createTestUser( prisma, UserRole.USER ) ).empNo );
        guestToken = await loginAs( app, ( await createTestUser( prisma, UserRole.GUEST ) ).empNo );
    });

    beforeEach( () => {
        // 캐시가 테스트끼리 섞이지 않도록 테스트마다 새 서비스 상태로 시작한다.
        ( service as unknown as { cache: Map<number, unknown> } ).cache.clear();
        fetchMock = jest.spyOn( globalThis, 'fetch' ).mockImplementation( ( url ) => {
            const year = Number( new URL( String( url ) ).searchParams.get( 'solYear' ) );
            return Promise.resolve( new Response( okXml( year ) ) );
        });
    });

    afterEach( () => {
        jest.restoreAllMocks();
    });

    afterAll( async () => {
        await app.close();
        process.env.HOLIDAY_API_KEY = originalKey;
    });

    it('로그인하지 않으면 401, 승인 전(GUEST)은 403', async () => {
        await request( app.getHttpServer() ).get( `/common/holidays?year=${thisYear}` ).expect( 401 );
        await get( `year=${thisYear}`, guestToken ).expect( 403 );
    });

    it('공공기관 휴일만 주고, 인코딩된 키를 다시 인코딩하지 않는다', async () => {
        const res = await get( `year=${thisYear}` ).expect( 200 );

        expect( res.body ).toEqual( holidays( thisYear ) );
        expect( String( fetchMock.mock.calls[0][0] ) ).toContain( 'serviceKey=test%2Fkey&' );
    });

    it('같은 연도는 캐시에서 주고 외부 API를 다시 호출하지 않는다', async () => {
        await get( `year=${thisYear}` ).expect( 200 );
        await get( `year=${thisYear}` ).expect( 200 );

        expect( fetchMock ).toHaveBeenCalledTimes( 1 );
    });

    it('동시 요청은 외부 호출 1번으로 합친다', async () => {
        const results = await Promise.all( [ 1, 2, 3, 4, 5 ].map( () => service.findByYear( thisYear ) ) );

        expect( fetchMock ).toHaveBeenCalledTimes( 1 );
        expect( results[4] ).toEqual( holidays( thisYear ) );
    });

    it('조회 범위 밖의 연도는 외부 호출 없이 빈 목록', async () => {
        const res = await get( `year=${thisYear + 3}` ).expect( 200 );

        expect( res.body ).toEqual( [] );
        expect( fetchMock ).not.toHaveBeenCalled();
    });

    it('연도가 잘못되면 400', async () => {
        await get( 'year=abc' ).expect( 400 );
        await get( 'year=3000' ).expect( 400 );
        await request( app.getHttpServer() ).get( '/common/holidays' ).set( 'Authorization', `Bearer ${userToken}` ).expect( 400 );
    });

    it('외부 API가 실패하면 빈 목록을 주고, 10분 동안 다시 호출하지 않는다', async () => {
        const now = Date.now();
        const clock = jest.spyOn( Date, 'now' ).mockReturnValue( now );
        jest.spyOn( console, 'warn' ).mockImplementation( () => undefined );
        fetchMock.mockRejectedValueOnce( new Error( 'network' ) );

        await expect( service.findByYear( thisYear ) ).resolves.toEqual( [] );

        clock.mockReturnValue( now + 9 * 60 * 1000 );
        await expect( service.findByYear( thisYear ) ).resolves.toEqual( [] );
        expect( fetchMock ).toHaveBeenCalledTimes( 1 );

        clock.mockReturnValue( now + 11 * 60 * 1000 );
        await expect( service.findByYear( thisYear ) ).resolves.toEqual( holidays( thisYear ) );
        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });

    it('외부 API가 응답하지 않으면 5초 뒤 포기하고 빈 목록을 준다', async () => {
        fetchMock.mockImplementationOnce( ( _url, init ) => new Promise( ( _resolve, reject ) => {
            init?.signal?.addEventListener( 'abort', () => reject( init.signal?.reason as Error ) );
        }) );

        const startedAt = Date.now();

        await expect( service.findByYear( thisYear ) ).resolves.toEqual( [] );
        expect( Date.now() - startedAt ).toBeGreaterThanOrEqual( 4500 );
    }, 10000 );

    it('캐시가 만료된 뒤 외부 API가 실패하면 이전 결과를 유지한다', async () => {
        const now = Date.now();
        const clock = jest.spyOn( Date, 'now' ).mockReturnValue( now );
        await service.findByYear( thisYear );

        clock.mockReturnValue( now + 25 * HOUR );
        fetchMock.mockResolvedValueOnce( new Response( '<response><header><resultCode>30</resultCode></header></response>' ) );

        await expect( service.findByYear( thisYear ) ).resolves.toEqual( holidays( thisYear ) );
        expect( fetchMock ).toHaveBeenCalledTimes( 2 );
    });
});
