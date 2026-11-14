//! 관리자 기능 권한 e2e (features.md 5.1 "관리자 기능 권한")
// - SUPER_ADMIN: 모든 관리자 기능 + ADMIN 승격·기능 지정
// - ADMIN: Users.adminPermissions에 있는 기능만 (@RequireAdmin(permission))
// - 관리자 계정(ADMIN·SUPER_ADMIN)의 권한·상태·삭제·비밀번호 초기화는 슈퍼관리자만
// - 마지막 슈퍼관리자는 강등·정지·삭제할 수 없다
// - 관리자 권한이 줄어들면 tokenVersion을 올린다(다시 로그인)

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminPermission, UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('관리자 기능 권한', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    const http = () => request( app.getHttpServer() );
    const auth = ( token: string ) => ({ Authorization: `Bearer ${token}` });

    const ids = { superA: 0, superB: 0, userAdmin: 0, boardAdmin: 0, member: 0 };
    const token = { superA: '', userAdmin: '', boardAdmin: '' };

    beforeAll( async () => {
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const superA = await createTestUser( prisma, UserRole.SUPER_ADMIN );
        const superB = await createTestUser( prisma, UserRole.SUPER_ADMIN );
        const userAdmin = await createTestUser( prisma, UserRole.ADMIN, [ AdminPermission.USERS ] );
        const boardAdmin = await createTestUser( prisma, UserRole.ADMIN, [ AdminPermission.BOARDS ] );
        const member = await createTestUser( prisma, UserRole.USER );

        Object.assign( ids, { superA: superA.id, superB: superB.id, userAdmin: userAdmin.id, boardAdmin: boardAdmin.id, member: member.id } );

        token.superA = await loginAs( app, superA.empNo );
        token.userAdmin = await loginAs( app, userAdmin.empNo );
        token.boardAdmin = await loginAs( app, boardAdmin.empNo );
    });

    afterAll( async () => {
        await app.close();
    });

    //* 기능별 API 접근 (@RequireAdmin)
    describe('기능별 API 접근', () => {
        it('회원 관리 기능이 있는 ADMIN만 회원 목록을 본다', async () => {
            await http().get( '/users' ).set( auth( token.userAdmin ) ).expect( 200 );
            await http().get( '/users' ).set( auth( token.boardAdmin ) ).expect( 403 );
        });

        it('SUPER_ADMIN은 기능 지정 없이 모든 관리자 API를 쓴다', async () => {
            await http().get( '/users' ).set( auth( token.superA ) ).expect( 200 );
            await http().get( '/boards/admin' ).set( auth( token.superA ) ).expect( 200 );
        });

        it('여러 관리자 화면이 같이 쓰는 조회(부서 목록)는 기능과 관계없이 ADMIN이면 된다', async () => {
            await http().get( '/departments' ).set( auth( token.boardAdmin ) ).expect( 200 );
        });

        it('access token에 관리자 기능(perms)이 들어간다', async () => {
            const payload = JSON.parse( Buffer.from( token.userAdmin.split( '.' )[1], 'base64url' ).toString() ) as { perms?: string[] };
            expect( payload.perms ).toEqual( [ AdminPermission.USERS ] );
        });
    });

    //* 권한 변경 (가입 승인·ADMIN 승격·기능 지정)
    describe('권한 변경', () => {
        it('회원 관리 ADMIN은 회원을 ADMIN으로 올리거나 기능을 지정할 수 없다', async () => {
            await http().patch( `/users/${ids.member}/role` ).set( auth( token.userAdmin ) ).send({ role: 'ADMIN' }).expect( 403 );
            await http().patch( `/users/${ids.member}/role` ).set( auth( token.userAdmin ) )
                .send({ role: 'USER', adminPermissions: [ 'USERS' ] }).expect( 400 ); // ADMIN이 아닌데 기능을 보냄
        });

        it('회원 관리 ADMIN은 다른 관리자 계정을 바꿀 수 없다 (권한·상태·삭제·비밀번호 초기화)', async () => {
            await http().patch( `/users/${ids.boardAdmin}/role` ).set( auth( token.userAdmin ) ).send({ role: 'USER' }).expect( 403 );
            await http().patch( `/users/${ids.superB}/status` ).set( auth( token.userAdmin ) ).send({ status: UserStatus.INACTIVE }).expect( 403 );
            await http().delete( `/users/${ids.superB}` ).set( auth( token.userAdmin ) ).expect( 403 );
            await http().patch( `/auth/reset/pw/${ids.superB}` ).set( auth( token.userAdmin ) ).expect( 403 );
        });

        it('SUPER_ADMIN은 회원을 ADMIN으로 올리고 기능을 지정한다', async () => {
            await http().patch( `/users/${ids.member}/role` ).set( auth( token.superA ) )
                .send({ role: 'ADMIN', adminPermissions: [ 'RESERVATIONS', 'LEAVES', 'LEAVES' ] }).expect( 200 );

            const member = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });
            expect( member.role ).toBe( UserRole.ADMIN );
            expect( member.adminPermissions ).toEqual( [ AdminPermission.RESERVATIONS, AdminPermission.LEAVES ] ); // 중복 제거
        });

        it('기능을 줄이면 tokenVersion이 올라가고, 기능을 늘리면 그대로다', async () => {
            const before = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });

            await http().patch( `/users/${ids.member}/role` ).set( auth( token.superA ) )
                .send({ role: 'ADMIN', adminPermissions: [ 'RESERVATIONS', 'LEAVES', 'USERS' ] }).expect( 200 );
            const added = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });
            expect( added.tokenVersion ).toBe( before.tokenVersion );

            await http().patch( `/users/${ids.member}/role` ).set( auth( token.superA ) )
                .send({ role: 'ADMIN', adminPermissions: [ 'RESERVATIONS' ] }).expect( 200 );
            const removed = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });
            expect( removed.tokenVersion ).toBe( before.tokenVersion + 1 );
        });

        it('ADMIN → USER로 바꾸면 관리자 기능을 비우고 tokenVersion을 올린다', async () => {
            const before = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });

            await http().patch( `/users/${ids.member}/role` ).set( auth( token.superA ) ).send({ role: 'USER' }).expect( 200 );

            const after = await prisma.users.findUniqueOrThrow({ where: { id: ids.member } });
            expect( after.role ).toBe( UserRole.USER );
            expect( after.adminPermissions ).toEqual( [] );
            expect( after.tokenVersion ).toBe( before.tokenVersion + 1 );
        });
    });

    //* 마지막 슈퍼관리자 보호
    describe('마지막 슈퍼관리자', () => {
        it('슈퍼관리자가 둘이면 다른 한 명은 강등할 수 있다', async () => {
            await http().patch( `/users/${ids.superB}/role` ).set( auth( token.superA ) ).send({ role: 'ADMIN' }).expect( 200 );
        });

        it('재직 중인 슈퍼관리자가 한 명뿐이면 강등·정지·삭제할 수 없다', async () => {
            // 남은 슈퍼관리자(superA) 본인은 checkNotSelf로 막히므로, 다른 슈퍼관리자를 만들어 superA를 정지 상태로 둔 뒤 확인한다.
            const superC = await createTestUser( prisma, UserRole.SUPER_ADMIN );
            const tokenC = await loginAs( app, superC.empNo );

            await prisma.users.update({ where: { id: ids.superA }, data: { status: UserStatus.INACTIVE } });

            // superC가 유일한 재직 슈퍼관리자 → 다른 슈퍼관리자(superA, 정지 중)를 강등하는 건 가능하지만,
            // superA가 superC를 강등하려 하면 남는 재직 슈퍼관리자가 없다 (superA 토큰은 아직 유효)
            await http().patch( `/users/${superC.id}/role` ).set( auth( token.superA ) ).send({ role: 'USER' }).expect( 400 );
            await http().patch( `/users/${superC.id}/status` ).set( auth( token.superA ) ).send({ status: UserStatus.RESIGNED }).expect( 400 );
            await http().delete( `/users/${superC.id}` ).set( auth( token.superA ) ).expect( 400 );

            await http().patch( `/users/${ids.superA}/role` ).set( auth( tokenC ) ).send({ role: 'USER' }).expect( 200 );
        });
    });
});
