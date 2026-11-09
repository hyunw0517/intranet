//! 애드온 ON/OFF e2e (AGENTS.md 10.1)
// 실제 앱(AppModule)과 테스트 DB로 확인한다.
// - GET /common/addons: 켜진 애드온 목록, 로그인 필요(USER 이상)
// - addonModule(): ADDONS에 있으면 모듈이 등록되고(API 200), 없으면 등록되지 않는다(API 404)
// - 잘못된 ADDONS면 서버(앱)가 시작되지 않는다
// ADDONS는 테스트마다 process.env에 직접 넣고 앱을 새로 만든다. (.env.test의 값은 비어 있음)

import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { IsPublic } from 'src/common/decorator/is-public.decorator';
import { addonModule } from 'src/config/addons.config';
import { UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

// addonModule 확인용 가짜 애드온 (실제 애드온 모듈이 생기기 전이라 테스트 안에서만 만든다)
@Controller( 'fake-addon' )
class FakeAddonController {
    @Get()
    @IsPublic()
    ping() {
        return 'pong';
    }
}

@Module({ controllers: [ FakeAddonController ] })
class FakeAddonModule {}

// ADDONS를 바꾼 뒤 앱을 만든다. extraImports: 테스트에서만 붙이는 모듈
async function createApp( addons: string | undefined, extraImports: Parameters<typeof Test.createTestingModule>[0]['imports'] = [] ) {
    if ( addons === undefined ) delete process.env.ADDONS;
    else process.env.ADDONS = addons;

    const moduleRef = await Test.createTestingModule({ imports: [ AppModule, ...extraImports ] }).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
    return app;
}

describe('애드온 ON/OFF', () => {
    const originalAddons = process.env.ADDONS;

    afterAll( () => {
        process.env.ADDONS = originalAddons;
    });

    //* 켜진 애드온 목록 API
    describe('GET /common/addons', () => {
        let app: INestApplication<App>;
        let userToken: string;
        let guestToken: string;

        beforeAll( async () => {
            // .env에 쓴 순서(approvals 먼저)와 관계없이 정의한 순서로 응답하는지도 함께 본다.
            app = await createApp( 'approvals, reservations' );

            const prisma = app.get( PrismaService );
            await resetDatabase( prisma );

            const user = await createTestUser( prisma, UserRole.USER );
            const guest = await createTestUser( prisma, UserRole.GUEST );
            userToken = await loginAs( app, user.empNo );
            guestToken = await loginAs( app, guest.empNo );
        });

        afterAll( async () => {
            await app.close();
        });

        // 로그인한 회원(USER)은 켜진 애드온 목록을 받는다. 꺼진 애드온(leaves, chats)은 목록에 없다.
        it('USER는 켜진 애드온 목록을 받는다', async () => {
            const res = await request( app.getHttpServer() )
                .get( '/common/addons' )
                .set( 'Authorization', `Bearer ${userToken}` )
                .expect( 200 );

            expect( res.body ).toEqual({ enabled: [ 'reservations', 'approvals' ] });
        });

        // 메뉴는 로그인 후에만 보이므로 공개하지 않는다. (사용자 결정: 로그인 필요)
        it('로그인하지 않으면 401', async () => {
            await request( app.getHttpServer() ).get( '/common/addons' ).expect( 401 );
        });

        // 새 API는 @Roles(USER) 이상 규칙 (AGENTS.md 5.2): 승인 전 회원(GUEST)은 막힌다.
        it('승인 전(GUEST)은 403', async () => {
            await request( app.getHttpServer() )
                .get( '/common/addons' )
                .set( 'Authorization', `Bearer ${guestToken}` )
                .expect( 403 );
        });
    });

    //* 모듈 등록 여부: 꺼진 애드온은 API 자체가 없다
    describe('addonModule()', () => {
        // ADDONS에 reservations가 있으면 가짜 애드온 모듈이 등록되어 API가 응답한다.
        it('켜져 있으면 모듈이 등록되어 API가 응답한다', async () => {
            const app = await createApp( 'reservations', [ addonModule( 'reservations', FakeAddonModule ) ] );

            await request( app.getHttpServer() ).get( '/fake-addon' ).expect( 200 ).expect( 'pong' );
            await app.close();
        });

        // 꺼져 있으면 모듈이 등록되지 않는다 → 라우트가 없으므로 권한 오류(401·403)가 아니라 404
        it('꺼져 있으면 모듈이 등록되지 않아 404', async () => {
            const app = await createApp( 'chats', [ addonModule( 'reservations', FakeAddonModule ) ] );

            await request( app.getHttpServer() ).get( '/fake-addon' ).expect( 404 );
            await app.close();
        });

        // 기본값 = 전부 꺼짐: ADDONS 변수가 아예 없어도 서버는 뜨고, 애드온은 등록되지 않는다.
        it('ADDONS 변수가 없으면 전부 꺼짐', async () => {
            const app = await createApp( undefined, [ addonModule( 'reservations', FakeAddonModule ) ] );

            await request( app.getHttpServer() ).get( '/fake-addon' ).expect( 404 );
            await app.close();
        });
    });

    //* 설정 오류: 서버가 시작되지 않는다
    describe('잘못된 ADDONS', () => {
        // 애드온 모듈이 하나도 등록되지 않은 상태에서도 핵심 AddonsService가 생성 단계에서 검사해 앱 생성이 실패한다.
        it.each([
            [ '모르는 이름', 'reservation', '알 수 없는 애드온' ],
            [ '본체 없는 옵션', 'leaves', 'approvals이(가) 켜져 있어야 합니다' ],
        ])( '%s이면 앱이 시작되지 않는다', async ( _label, addons, message ) => {
            await expect( createApp( addons ) ).rejects.toThrow( message );
        });
    });
});
