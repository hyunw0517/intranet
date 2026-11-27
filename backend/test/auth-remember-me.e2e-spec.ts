//! 로그인 유지 e2e (features.md 5.2)
// 실제 앱과 테스트 DB로 확인한다.
// - rememberMe: false → refresh 쿠키에 Max-Age가 없다(세션 쿠키). 브라우저를 닫으면 사라진다.
// - 쿠키를 다시 발급하는 경로(재발급·비밀번호 변경·모든 기기 로그아웃)도 처음 선택을 유지한다.
// - 값이 없으면(회원가입, rememberMe 없는 로그인) 기존처럼 Max-Age가 있다.
// 로그인 API는 IP당 1분 요청 수 제한(AUTH_THROTTLE_LIMIT)이 있어 이 파일의 로그인 횟수를 그 안으로 유지한다.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from 'src/prisma/prisma.service';
import { CURRENT_CONSENT_VERSIONS } from 'src/users/const/consent.const';
import { createTestApp } from './utils/app';
import { createTestUser, TEST_PASSWORD } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

// 응답의 refreshToken Set-Cookie 한 줄
function refreshCookieOf( res: request.Response ) {
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find( ( c ) => c.startsWith( 'refreshToken=' ) );

    if ( !cookie ) throw new Error( 'refreshToken 쿠키가 없습니다.' );

    return cookie;
}

// 다음 요청에 실을 "refreshToken=값" 부분
const cookieValueOf = ( setCookie: string ) => setCookie.split( ';' )[0];

// 세션 쿠키 = 만료 속성이 없는 쿠키
const isSessionCookie = ( setCookie: string ) => !/max-age=/i.test( setCookie ) && !/expires=/i.test( setCookie );

describe('로그인 유지', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    const login = ( empNo: string, body?: object ) => {
        const basic = Buffer.from( `${empNo}:${TEST_PASSWORD}` ).toString( 'base64' );
        const req = request( app.getHttpServer() ).post( '/auth/login/emp' ).set( 'Authorization', `Basic ${basic}` );

        return body ? req.send( body ) : req;
    };

    beforeAll( async () => {
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );
    });

    afterAll( async () => {
        await app.close();
    });

    it('체크하지 않으면 세션 쿠키로 발급하고 세션에 선택을 저장한다', async () => {
        const user = await createTestUser( prisma );

        const res = await login( user.empNo, { rememberMe: false } ).expect( 201 );

        expect( isSessionCookie( refreshCookieOf( res ) ) ).toBe( true );

        const session = await prisma.authSession.findFirstOrThrow({ where: { userId: user.id } });
        expect( session.rememberMe ).toBe( false );
    });

    it('체크하면 만료 시간이 있는 쿠키로 발급한다', async () => {
        const user = await createTestUser( prisma );

        const res = await login( user.empNo, { rememberMe: true } ).expect( 201 );

        expect( refreshCookieOf( res ) ).toMatch( /Max-Age=86400/i );
    });

    it('rememberMe 없이 로그인하면 기존처럼 유지한다', async () => {
        const user = await createTestUser( prisma );

        const res = await login( user.empNo ).expect( 201 );

        expect( refreshCookieOf( res ) ).toMatch( /Max-Age=86400/i );
    });

    it('boolean이 아닌 값은 400이고 세션을 만들지 않는다', async () => {
        const user = await createTestUser( prisma );

        await login( user.empNo, { rememberMe: 'false' } ).expect( 400 );

        expect( await prisma.authSession.count({ where: { userId: user.id } }) ).toBe( 0 );
    });

    it('재발급해도 처음 선택을 유지한다', async () => {
        const notRemembered = await createTestUser( prisma );
        const remembered = await createTestUser( prisma );

        const sessionLogin = await login( notRemembered.empNo, { rememberMe: false } ).expect( 201 );
        const keepLogin = await login( remembered.empNo, { rememberMe: true } ).expect( 201 );

        const sessionReissue = await request( app.getHttpServer() )
            .post( '/auth/token/access' )
            .set( 'Cookie', cookieValueOf( refreshCookieOf( sessionLogin ) ) )
            .expect( 201 );

        const keepReissue = await request( app.getHttpServer() )
            .post( '/auth/token/access' )
            .set( 'Cookie', cookieValueOf( refreshCookieOf( keepLogin ) ) )
            .expect( 201 );

        expect( isSessionCookie( refreshCookieOf( sessionReissue ) ) ).toBe( true );
        expect( refreshCookieOf( keepReissue ) ).toMatch( /Max-Age=/i );
    });

    it('모든 기기 로그아웃 후에도 지금 기기의 선택을 유지한다', async () => {
        const user = await createTestUser( prisma );
        const loginRes = await login( user.empNo, { rememberMe: false } ).expect( 201 );
        const { accessToken } = loginRes.body as { accessToken: string };

        const res = await request( app.getHttpServer() )
            .post( '/auth/logout/all' )
            .set( 'Authorization', `Bearer ${accessToken}` )
            .expect( 201 );

        expect( isSessionCookie( refreshCookieOf( res ) ) ).toBe( true );
    });

    it('비밀번호를 변경해도 지금 기기의 선택을 유지한다', async () => {
        const user = await createTestUser( prisma );
        const loginRes = await login( user.empNo, { rememberMe: false } ).expect( 201 );
        const { accessToken } = loginRes.body as { accessToken: string };

        const res = await request( app.getHttpServer() )
            .patch( '/auth/change/pw' )
            .set( 'Authorization', `Bearer ${accessToken}` )
            .send({ currentPassword: TEST_PASSWORD, newPassword: 'Changed1234!' })
            .expect( 200 );

        expect( isSessionCookie( refreshCookieOf( res ) ) ).toBe( true );
    });

    it('회원가입 직후 자동 로그인은 유지한다', async () => {
        const res = await request( app.getHttpServer() )
            .post( '/auth/register/emp' )
            .send({
                empNo: '2699001',
                email: 'remember@test.com',
                password: 'Register1234!',
                name: '가입자',
                consents: Object.entries( CURRENT_CONSENT_VERSIONS ).map( ( [type, version] ) => ({ type, version }) ),
            })
            .expect( 201 );

        expect( refreshCookieOf( res ) ).toMatch( /Max-Age=86400/i );
    });
});
