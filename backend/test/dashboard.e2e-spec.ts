//! 대시보드 API e2e (docs/frontend/fe-17-dashboard.md)
// - GET /common/audit-logs: AUDIT 기능만, 최신순 커서, 필터, 꺼진 애드온의 로그 제외
// - GET /users/stats: USERS 기능만, 회원 현황 건수
// - GET /boards/recent-notices: 읽을 수 있는 공지 게시판의 글만, 비밀글 제외, 작성자 미포함

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminPermission, AuditActionType, AuditTargetType, BoardType, UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

interface AuditRow { id: string; targetType: AuditTargetType | null; actionType: AuditActionType; actor: { empNo: string } | null }
interface AuditPage { data: AuditRow[]; meta: { nextCursor: string | null; hasNext: boolean } }

describe('대시보드 API', () => {
    const originalAddons = process.env.ADDONS;

    let app: INestApplication<App>;
    let prisma: PrismaService;
    let actorEmpNo: string;

    const token = { auditAdmin: '', superAdmin: '', userAdmin: '', member: '' };
    const http = () => request( app.getHttpServer() );
    const auth = ( value: string ) => ({ Authorization: `Bearer ${value}` });
    const auditLogs = async ( query: string ) => {
        const res = await http().get( `/common/audit-logs?${query}` ).set( auth( token.auditAdmin ) ).expect( 200 );
        return res.body as AuditPage;
    };

    beforeAll( async () => {
        // 시설 예약만 켜고 과제 관리는 끈 상태로 확인한다.
        process.env.ADDONS = 'reservations';
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const auditAdmin = await createTestUser( prisma, UserRole.ADMIN, [ AdminPermission.AUDIT ] );
        const superAdmin = await createTestUser( prisma, UserRole.SUPER_ADMIN );
        const userAdmin = await createTestUser( prisma, UserRole.ADMIN, [ AdminPermission.USERS ] );
        const member = await createTestUser( prisma, UserRole.USER );
        actorEmpNo = member.empNo;

        token.auditAdmin = await loginAs( app, auditAdmin.empNo );
        token.superAdmin = await loginAs( app, superAdmin.empNo );
        token.userAdmin = await loginAs( app, userAdmin.empNo );
        token.member = await loginAs( app, member.empNo );

        // 로그인 기록을 지우고 확인할 행만 남긴다.
        await prisma.audit.deleteMany();
        await prisma.audit.createMany({
            data: [
                { targetType: AuditTargetType.BOARD, actionType: AuditActionType.CREATE, createdId: member.id, createdAt: new Date( '2026-11-09T14:59:00Z' ) },  // KST 11/09 23:59
                { targetType: AuditTargetType.FACILITY, actionType: AuditActionType.UPDATE, createdId: member.id, createdAt: new Date( '2026-11-09T15:00:00Z' ) },  // KST 11/10 00:00
                { targetType: AuditTargetType.PROJECT, actionType: AuditActionType.DELETE, createdId: member.id, createdAt: new Date( '2026-11-10T01:00:00Z' ) },   // 꺼진 애드온
                { targetType: null, actionType: AuditActionType.LOGIN_FAILED, createdAt: new Date( '2026-11-10T14:59:00Z' ) },                                       // KST 11/10 23:59, 대상 없음
                { targetType: AuditTargetType.USER, actionType: AuditActionType.LOGIN, createdId: auditAdmin.id, createdAt: new Date( '2026-11-10T15:00:00Z' ) },    // KST 11/11 00:00
            ],
        });
    });

    afterAll( async () => {
        await app.close();
        process.env.ADDONS = originalAddons;
    });

    describe('GET /common/audit-logs', () => {
        it('AUDIT 기능이 없으면 403, 로그인하지 않으면 401', async () => {
            await http().get( '/common/audit-logs' ).expect( 401 );
            await http().get( '/common/audit-logs' ).set( auth( token.member ) ).expect( 403 );
            await http().get( '/common/audit-logs' ).set( auth( token.userAdmin ) ).expect( 403 );
        });

        it('슈퍼관리자는 AUDIT 기능 지정 없이 조회한다', async () => {
            await http().get( '/common/audit-logs' ).set( auth( token.superAdmin ) ).expect( 200 );
        });

        it('최신순으로 주고, 꺼진 애드온의 로그는 빼며, 대상이 없는 로그는 남긴다', async () => {
            const { data } = await auditLogs( 'take=100' );

            expect( data.map( ( row ) => row.targetType ) ).toEqual([ AuditTargetType.USER, null, AuditTargetType.FACILITY, AuditTargetType.BOARD ]);
            expect( typeof data[0].id ).toBe( 'string' );
        });

        it('꺼진 애드온의 대상을 직접 골라도 나오지 않는다', async () => {
            const { data } = await auditLogs( `targetType=${AuditTargetType.PROJECT}` );

            expect( data ).toEqual( [] );
        });

        it('커서로 이어서 조회하면 겹치거나 빠지는 행이 없다', async () => {
            const first = await auditLogs( 'take=2' );
            const second = await auditLogs( `take=2&cursor=${first.meta.nextCursor}` );

            expect( first.meta.hasNext ).toBe( true );
            expect( second.meta.hasNext ).toBe( false );
            expect( [ ...first.data, ...second.data ].map( ( row ) => row.targetType ) )
                .toEqual([ AuditTargetType.USER, null, AuditTargetType.FACILITY, AuditTargetType.BOARD ]);
        });

        it('기간은 KST 날짜 기준으로 시작일 00:00부터 종료일 24:00 전까지다', async () => {
            const { data } = await auditLogs( 'from=2026-11-10&to=2026-11-10' );

            expect( data.map( ( row ) => row.actionType ) ).toEqual([ AuditActionType.LOGIN_FAILED, AuditActionType.UPDATE ]);
        });

        it('행동·작업자로 거른다', async () => {
            const byAction = await auditLogs( `actionType=${AuditActionType.CREATE}` );
            const byActor = await auditLogs( `actor=${actorEmpNo}` );

            expect( byAction.data ).toHaveLength( 1 );
            expect( byActor.data.map( ( row ) => row.targetType ) ).toEqual([ AuditTargetType.FACILITY, AuditTargetType.BOARD ]);
        });

        it('잘못된 조건은 400', async () => {
            const bad = [ 'from=2026-11-11&to=2026-11-10', 'from=2026-13-45', 'from=2026-11-10T00:00:00Z', 'actionType=NOPE' ];

            for ( const query of bad ) {
                await http().get( `/common/audit-logs?${query}` ).set( auth( token.auditAdmin ) ).expect( 400 );
            }
        });
    });

    describe('GET /users/stats', () => {
        it('USERS 기능이 없으면 403', async () => {
            await http().get( '/users/stats' ).set( auth( token.member ) ).expect( 403 );
            await http().get( '/users/stats' ).set( auth( token.auditAdmin ) ).expect( 403 );
        });

        it('승인 대기·재직·비활성·잠금 건수를 센다', async () => {
            const before = await http().get( '/users/stats' ).set( auth( token.userAdmin ) ).expect( 200 );

            const guest = await createTestUser( prisma, UserRole.GUEST );
            const inactive = await createTestUser( prisma, UserRole.USER );
            await prisma.users.update({ where: { id: inactive.id }, data: { status: UserStatus.INACTIVE } });
            const deleted = await createTestUser( prisma, UserRole.USER );
            await prisma.users.update({ where: { id: deleted.id }, data: { deleted: true } });

            const lastFailedAt = new Date();
            const future = new Date( Date.now() + 60_000 );
            const past = new Date( Date.now() - 60_000 );
            await prisma.loginHistory.createMany({
                data: [
                    { empNo: inactive.empNo, userId: inactive.id, lockedUntil: future, lastFailedAt },  // 잠김
                    { empNo: guest.empNo, userId: guest.id, lockedUntil: past, lastFailedAt },          // 잠금 끝남
                    { empNo: 'NO-SUCH-USER', userId: null, lockedUntil: future, lastFailedAt },         // 없는 사번
                ],
            });

            const res = await http().get( '/users/stats' ).set( auth( token.userAdmin ) ).expect( 200 );
            const start = before.body as { pending: number; active: number; inactive: number; locked: number };

            expect( res.body ).toEqual({
                pending: start.pending + 1,
                active: start.active,
                inactive: start.inactive + 1,
                locked: start.locked + 1,
            });
        });
    });

    describe('GET /boards/recent-notices', () => {
        it('읽을 수 있는 공지 게시판의 글만 최신순으로, 비밀글과 작성자 없이 준다', async () => {
            const author = await createTestUser( prisma, UserRole.USER );
            const audit = { createdId: author.id, updatedId: author.id };

            const open = await prisma.board.create({ data: { type: BoardType.NOTICE, name: '전체 공지', ...audit } });
            await prisma.boardAuth.create({ data: { boardId: open.id, authRead: true, ...audit } });
            const closed = await prisma.board.create({ data: { type: BoardType.NOTICE, name: '관리자 공지', ...audit } });  // 규칙 없음 = 기본 거부
            const normal = await prisma.board.create({ data: { type: BoardType.NORMAL, name: '자유 게시판', ...audit } });
            await prisma.boardAuth.create({ data: { boardId: normal.id, authRead: true, ...audit } });

            const post = ( boardId: number, title: string, minute: number, isSecret = false ) => prisma.post.create({
                data: { boardId, authorId: author.id, title, isSecret, createdAt: new Date( Date.UTC( 2026, 10, 10, 0, minute ) ), ...audit },
            });
            await post( open.id, '오래된 공지', 1 );
            await post( open.id, '새 공지', 2 );
            await post( open.id, '비밀 공지', 3, true );
            await post( closed.id, '볼 수 없는 공지', 4 );
            await post( normal.id, '일반 글', 5 );

            const res = await http().get( '/boards/recent-notices' ).set( auth( token.member ) ).expect( 200 );
            const rows = res.body as { title: string; board: { name: string } }[];

            expect( rows.map( ( row ) => row.title ) ).toEqual([ '새 공지', '오래된 공지' ]);
            expect( rows[0].board.name ).toBe( '전체 공지' );
            expect( rows[0] ).not.toHaveProperty( 'author' );
            expect( rows[0] ).not.toHaveProperty( 'authorId' );
        });

        it('최대 5건만 준다', async () => {
            const board = await prisma.board.findFirstOrThrow({ where: { name: '전체 공지' } });
            const author = await prisma.users.findFirstOrThrow();

            await prisma.post.createMany({
                data: Array.from( { length: 6 }, ( _, index ) => ({
                    boardId: board.id, authorId: author.id, title: `추가 공지 ${index}`, createdId: author.id, updatedId: author.id,
                }) ),
            });

            const res = await http().get( '/boards/recent-notices' ).set( auth( token.member ) ).expect( 200 );

            expect( res.body ).toHaveLength( 5 );
        });
    });
});
