//! 사용자용 조직도·사원 검색 e2e (features.md 5.1)
// - GET /organization/chart: 부서 트리 + 구성원 수(겸직 포함, 하위 부서 제외, 재직·승인 회원만)
// - GET /organization/chart/:departmentId/members: 직책 → 직급 → 이름 순, 겸직 포함, 공개 범위(이메일·회사 전화만)
// - GET /organization/directory: 이름·사번·부서명 검색, 이름순 페이지
// - 모두 USER 이상 (GUEST 403)

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

interface DirectoryUser {
    id: number;
    name: string;
    email: string;
    tel: string | null;
    positionName: string | null;
    departments: { departmentId: number; departmentName: string; jobTitleName: string | null; isPrimary: boolean }[];
}

describe('조직도·사원 검색', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let token = '';
    let guestToken = '';
    const dept = { hq: 0, team: 0, other: 0 };
    const user = { lead: 0, senior: 0, junior: 0, concurrent: 0 };

    const http = () => request( app.getHttpServer() );
    const get = ( url: string ) => http().get( url ).set( 'Authorization', `Bearer ${token}` );

    beforeAll( async () => {
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const viewer = await createTestUser( prisma, UserRole.USER );
        const actor = { createdId: viewer.id, updatedId: viewer.id };

        const hq = await prisma.department.create({ data: { name: '경영본부', sortOrder: 0, ...actor } });
        const team = await prisma.department.create({ data: { name: '인사팀', parentDepartmentId: hq.id, sortOrder: 0, ...actor } });
        const other = await prisma.department.create({ data: { name: '영업팀', sortOrder: 1, ...actor } });
        Object.assign( dept, { hq: hq.id, team: team.id, other: other.id } );

        const manager = await prisma.position.create({ data: { name: '과장', sortOrder: 1, ...actor } });
        const staff = await prisma.position.create({ data: { name: '사원', sortOrder: 2, ...actor } });
        const leader = await prisma.jobTitle.create({ data: { name: '팀장', sortOrder: 0, ...actor } });

        const make = async ( name: string, positionId: number | null, tel: string | null ) => {
            const u = await createTestUser( prisma, UserRole.USER );
            return prisma.users.update({ where: { id: u.id }, data: { name, positionId, tel, hp: '010-0000-0000', birthday: new Date( '1990-01-01' ) } });
        };

        // 인사팀: 팀장(사원 직급이어도 직책이 먼저) / 과장 / 사원 / 영업팀 대표 소속 겸직자
        const lead = await make( '하팀장', staff.id, '02-111-1111' );
        const senior = await make( '나과장', manager.id, null );
        const junior = await make( '가사원', staff.id, null );
        const concurrent = await make( '다겸직', null, null );
        Object.assign( user, { lead: lead.id, senior: senior.id, junior: junior.id, concurrent: concurrent.id } );

        const link = ( userId: number, departmentId: number, isPrimary: boolean, jobTitleId: number | null = null ) =>
            prisma.userDepartment.create({ data: { userId, departmentId, isPrimary, jobTitleId, ...actor } });
        await link( lead.id, team.id, true, leader.id );
        await link( senior.id, team.id, true );
        await link( junior.id, team.id, true );
        await link( concurrent.id, other.id, true );
        await link( concurrent.id, team.id, false );

        // 목록에 나오면 안 되는 회원: 퇴사자, 승인 대기
        const resigned = await createTestUser( prisma, UserRole.USER );
        await prisma.users.update({ where: { id: resigned.id }, data: { status: UserStatus.RESIGNED } });
        await link( resigned.id, team.id, true );
        const guest = await createTestUser( prisma, UserRole.GUEST );
        await link( guest.id, team.id, true );

        token = await loginAs( app, viewer.empNo );
        guestToken = await loginAs( app, guest.empNo );
    });

    afterAll( async () => {
        await app.close();
    });

    it('조직도: 트리 순서 + 구성원 수(겸직 포함, 하위 부서·퇴사자·승인 대기 제외)', async () => {
        const res = await get( '/organization/chart' ).expect( 200 );

        expect( res.body ).toEqual([
            { id: dept.hq, name: '경영본부', parentDepartmentId: null, depth: 0, memberCount: 0 },
            { id: dept.team, name: '인사팀', parentDepartmentId: dept.hq, depth: 1, memberCount: 4 },
            { id: dept.other, name: '영업팀', parentDepartmentId: null, depth: 0, memberCount: 1 },
        ]);
    });

    it('부서 구성원: 직책 → 직급 → 이름 순, 겸직자 포함, 휴대폰·생일은 내보내지 않는다', async () => {
        const res = await get( `/organization/chart/${dept.team}/members` ).expect( 200 );
        const members = res.body as DirectoryUser[];

        expect( members.map( ( m ) => m.id ) ).toEqual( [ user.lead, user.senior, user.junior, user.concurrent ] );

        const lead = members[0] as DirectoryUser & Record<string, unknown>;
        expect( lead.tel ).toBe( '02-111-1111' );
        expect( lead.email ).toEqual( expect.any( String ) );
        expect( lead.hp ).toBeUndefined();
        expect( lead.birthday ).toBeUndefined();
        expect( lead.password ).toBeUndefined();
        expect( lead.departments ).toEqual( [ { departmentId: dept.team, departmentName: '인사팀', jobTitleName: '팀장', isPrimary: true } ] );

        // 겸직자: 대표 소속(영업팀)이 먼저
        expect( members[3].departments.map( ( d ) => [ d.departmentName, d.isPrimary ] ) ).toEqual( [ [ '영업팀', true ], [ '인사팀', false ] ] );
    });

    it('없는 부서면 404', async () => {
        await get( '/organization/chart/999999/members' ).expect( 404 );
    });

    it('사원 검색: 부서명(겸직 포함)으로 찾고 이름순 페이지', async () => {
        const res = await get( '/organization/directory?search=인사&take=2&page=1' ).expect( 200 );

        expect( res.body.meta ).toMatchObject( { page: 1, take: 2, total: 4, totalPages: 2, hasNext: true } );
        expect( ( res.body.data as DirectoryUser[] ).map( ( u ) => u.name ) ).toEqual( [ '가사원', '나과장' ] );

        const page2 = await get( '/organization/directory?search=인사&take=2&page=2' ).expect( 200 );
        expect( ( page2.body.data as DirectoryUser[] ).map( ( u ) => u.name ) ).toEqual( [ '다겸직', '하팀장' ] );
    });

    it('사원 검색: 이름으로 찾는다', async () => {
        const res = await get( `/organization/directory?search=${encodeURIComponent( '과장' )}` ).expect( 200 );
        expect( ( res.body.data as DirectoryUser[] ).map( ( u ) => u.id ) ).toEqual( [ user.senior ] );
    });

    it('승인 대기(GUEST)는 403', async () => {
        const as = ( url: string ) => http().get( url ).set( 'Authorization', `Bearer ${guestToken}` ).expect( 403 );
        await as( '/organization/chart' );
        await as( `/organization/chart/${dept.team}/members` );
        await as( '/organization/directory' );
    });
});
