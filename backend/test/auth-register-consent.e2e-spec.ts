//! 회원가입 필수 동의 e2e (features.md 5.1)
// - 이용약관·개인정보 수집·이용을 모두 현재 버전으로 동의해야 가입된다.
// - 동의하면 항목별 AGREE 이력이 가입과 함께 남고, 거부되면 회원도 이력도 남지 않는다.
// 가입 API는 IP당 1분 요청 수 제한(AUTH_THROTTLE_LIMIT)이 있어 이 파일의 가입 요청을 그 안으로 유지한다.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConsentAction, ConsentType } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CURRENT_CONSENT_VERSIONS } from 'src/users/const/consent.const';
import { createTestApp } from './utils/app';
import { resetDatabase } from './utils/reset-database';

const CURRENT_CONSENTS = Object.entries( CURRENT_CONSENT_VERSIONS ).map( ( [type, version] ) => ({ type, version }) );

describe('회원가입 필수 동의', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    const register = ( empNo: string, consents?: object ) =>
        request( app.getHttpServer() )
            .post( '/auth/register/emp' )
            .send({ empNo, email: `${empNo}@test.com`, password: 'Register1234!', name: '가입자', consents });

    const expectNotRegistered = async ( empNo: string ) => {
        expect( await prisma.users.count({ where: { empNo } }) ).toBe( 0 );
    };

    beforeAll( async () => {
        process.env.COMPANY_NAME = '테스트 회사';
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );
    });

    afterAll( async () => {
        await app.close();
    });

    it('로그인 없이 동의 화면의 회사명을 조회한다', async () => {
        const res = await request( app.getHttpServer() ).get( '/auth/consent-info' ).expect( 200 );

        expect( res.body ).toEqual({ companyName: '테스트 회사' });
    });

    it('모두 동의하면 가입되고 항목별 동의 이력을 남긴다', async () => {
        await register( '2698001', CURRENT_CONSENTS ).expect( 201 );

        const user = await prisma.users.findFirstOrThrow({ where: { empNo: '2698001' } });
        const consents = await prisma.userConsent.findMany({ where: { userId: user.id }, orderBy: { type: 'asc' } });

        expect( consents.map( ( { type, action, version } ) => ({ type, action, version }) ) ).toEqual([
            { type: ConsentType.TERMS_OF_SERVICE, action: ConsentAction.AGREE, version: CURRENT_CONSENT_VERSIONS.TERMS_OF_SERVICE },
            { type: ConsentType.PRIVACY_COLLECTION, action: ConsentAction.AGREE, version: CURRENT_CONSENT_VERSIONS.PRIVACY_COLLECTION },
        ]);
    });

    it('동의 항목이 없으면 400', async () => {
        await register( '2698002' ).expect( 400 );
        await expectNotRegistered( '2698002' );
    });

    it('한 항목만 동의하면 400', async () => {
        await register( '2698003', CURRENT_CONSENTS.slice( 0, 1 ) ).expect( 400 );
        await expectNotRegistered( '2698003' );
    });

    it('현재 버전이 아니면 400', async () => {
        const stale = CURRENT_CONSENTS.map( ( consent ) => ({ ...consent, version: '0.9' }) );

        await register( '2698004', stale ).expect( 400 );
        await expectNotRegistered( '2698004' );
    });

    it('없는 동의 항목이면 400', async () => {
        await register( '2698005', [ ...CURRENT_CONSENTS, { type: 'MARKETING', version: '1.0' } ] ).expect( 400 );
        await expectNotRegistered( '2698005' );
    });
});
