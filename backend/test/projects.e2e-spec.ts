//! 과제 관리 e2e (애드온 projects, docs/design/projects.md)
// 실제 앱(AppModule) + 테스트 DB(intranet_test). .env.test의 ADDONS에 projects를 켜 둔다.
// ⭐ 핵심: 마지막 책임자 보호(동시에 서로 강등), 칸반 동시 이동 후에도 컬럼 번호가 0..n-1로 유지, 담당자 부재 규칙.

// supertest의 res.body는 any 타입이다. 응답 형태는 각 expect에서 검사하므로 이 파일에서만 any 관련 규칙을 끈다.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { addKstDays, kstDateString } from 'src/common/util/date.util';
import { AdminPermission, NotificationActionType, ProjectTaskStatus, UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ProjectTasksService } from 'src/projects/tasks/project-tasks.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

// 응답 행에서 테스트가 읽는 필드만
type MemberRow = { id: number; user: { id: number } };
type TaskRow = { id: number; project: { id: number } };

describe('과제 관리', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let http: () => ReturnType<typeof request>;

    let adminToken: string;     // 과제 관리 관리자 (PROJECTS 기능만)
    let ownerToken: string;     // 프로젝트를 만든 사람 = 책임자
    let memberToken: string;    // 참여자
    let outsiderToken: string;  // 참여하지 않은 회원
    let ownerId: number;
    let memberId: number;
    let outsiderId: number;
    let thirdId: number;        // 참여자로 추가했다가 뺄 회원

    const auth = ( token: string ) => ({ Authorization: `Bearer ${token}` });

    const createProject = async ( token: string, body: Record<string, unknown> = {} ) =>
        ( await http().post( '/projects' ).set( auth( token ) ).send({ name: '프로젝트', ...body }).expect( 201 ) ).body;

    const addMember = async ( projectId: number, userId: number, body: Record<string, unknown> = {} ) =>
        ( await http().post( `/projects/${projectId}/members` ).set( auth( ownerToken ) ).send({ userId, ...body }).expect( 201 ) ).body;

    const createTask = async ( projectId: number, token: string, body: Record<string, unknown> = {} ) =>
        ( await http().post( `/projects/${projectId}/tasks` ).set( auth( token ) ).send({ title: '과제', ...body }).expect( 201 ) ).body;

    const columnOrder = async ( projectId: number, status: ProjectTaskStatus ) =>
        prisma.projectTask.findMany({ where: { projectId, status, deleted: false }, orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true } });

    beforeAll( async () => {
        app = await createTestApp();
        http = () => request( app.getHttpServer() );

        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const admin = await createTestUser( prisma, UserRole.ADMIN, [ AdminPermission.PROJECTS ] );
        const owner = await createTestUser( prisma, UserRole.USER );
        const member = await createTestUser( prisma, UserRole.USER );
        const outsider = await createTestUser( prisma, UserRole.USER );
        const third = await createTestUser( prisma, UserRole.USER );
        ownerId = owner.id;
        memberId = member.id;
        outsiderId = outsider.id;
        thirdId = third.id;

        adminToken = await loginAs( app, admin.empNo );
        ownerToken = await loginAs( app, owner.empNo );
        memberToken = await loginAs( app, member.empNo );
        outsiderToken = await loginAs( app, outsider.empNo );
    });

    afterAll( async () => {
        await app.close();
    });

    //* 공용 회원 검색 (핵심 users, 참여자 추가 화면이 쓴다)
    describe('회원 검색 GET /users/search', () => {
        it('재직 중인 승인 회원만, 개인정보 없이 (GUEST·퇴사 제외)', async () => {
            const guest = await createTestUser( prisma, UserRole.GUEST );
            const resigned = await createTestUser( prisma, UserRole.USER );
            await prisma.users.update({ where: { id: resigned.id }, data: { status: 'RESIGNED' } });

            const res = await http().get( '/users/search' ).set( auth( memberToken ) ).query({ search: '테스트' }).expect( 200 );
            const ids = res.body.map( ( u: { id: number } ) => u.id );

            expect( ids ).toEqual( expect.arrayContaining([ ownerId, outsiderId ]) );
            expect( ids ).not.toContain( guest.id );
            expect( ids ).not.toContain( resigned.id );
            expect( Object.keys( res.body[0] ).sort() ).toEqual([ 'departmentName', 'empNo', 'id', 'jobTitleName', 'name', 'positionName' ]);
        });

        it('로그인하지 않으면 401', async () => {
            await http().get( '/users/search' ).expect( 401 );
        });
    });

    //* 거래처
    describe('거래처', () => {
        it('사업자등록번호는 숫자만 저장하고, 표기가 달라도 같은 번호면 중복(400)', async () => {
            const res = await http().post( '/projects/clients' ).set( auth( ownerToken ) )
                .send({ name: '가나상사', businessNo: '123-45-67890' }).expect( 201 );
            expect( res.body.businessNo ).toBe( '1234567890' );

            const dup = await http().post( '/projects/clients' ).set( auth( memberToken ) )
                .send({ name: '가나상사(중복)', businessNo: '1234567890' }).expect( 400 );
            expect( dup.body.message ).toContain( '가나상사' );
        });

        it('동시에 같은 번호로 등록해도 하나만 저장된다 (서비스 검사 + DB 부분 unique)', async () => {
            const send = () => http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '동시상사', businessNo: '2222222222' });
            const results = await Promise.all([ send(), send(), send() ]);

            expect( results.filter( ( r ) => r.status === 201 ) ).toHaveLength( 1 );
            expect( results.filter( ( r ) => r.status !== 201 ).every( ( r ) => [ 400, 409 ].includes( r.status ) ) ).toBe( true );
            expect( await prisma.projectClient.count({ where: { businessNo: '2222222222', deleted: false } }) ).toBe( 1 );
        });

        it('누구나 삭제하고, 삭제 탭에서 삭제한 사람을 본다. 같은 번호 재등록 후 복구는 400', async () => {
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) )
                .send({ name: '삭제상사', businessNo: '3333333333' }).expect( 201 ) ).body;

            await http().delete( `/projects/clients/${client.id}` ).set( auth( memberToken ) ).expect( 200 );

            const list = await http().get( '/projects/clients' ).set( auth( ownerToken ) ).query({ search: '삭제상사' }).expect( 200 );
            expect( list.body.data ).toHaveLength( 0 );

            const deleted = await http().get( '/projects/clients/deleted' ).set( auth( ownerToken ) ).expect( 200 );
            const row = deleted.body.data.find( ( c: { id: number } ) => c.id === client.id );
            expect( row.deletedBy.id ).toBe( memberId );

            // 삭제된 거래처와 같은 번호로 새로 등록할 수 있다 → 그 뒤 옛 거래처 복구는 중복이라 400
            await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '삭제상사(신규)', businessNo: '3333333333' }).expect( 201 );
            await http().patch( `/projects/clients/${client.id}/restore` ).set( auth( ownerToken ) ).expect( 400 );
        });

        it('복구하면 목록에 다시 보인다', async () => {
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '복구상사' }).expect( 201 ) ).body;
            await http().delete( `/projects/clients/${client.id}` ).set( auth( ownerToken ) ).expect( 200 );
            await http().patch( `/projects/clients/${client.id}/restore` ).set( auth( memberToken ) ).expect( 200 );

            const list = await http().get( '/projects/clients' ).set( auth( ownerToken ) ).query({ search: '복구상사' }).expect( 200 );
            expect( list.body.data ).toHaveLength( 1 );
        });

        it('삭제된 거래처는 새 프로젝트에 연결할 수 없지만, 기존 프로젝트에는 실제 이름이 남는다', async () => {
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '연결상사' }).expect( 201 ) ).body;
            const project = await createProject( ownerToken, { clientId: client.id } );
            await http().delete( `/projects/clients/${client.id}` ).set( auth( ownerToken ) ).expect( 200 );

            await http().post( '/projects' ).set( auth( ownerToken ) ).send({ name: '새 프로젝트', clientId: client.id }).expect( 404 );

            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.client ).toMatchObject({ id: client.id, name: '연결상사', deleted: true });
        });

        it('담당자 등록·수정·삭제', async () => {
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '담당상사' }).expect( 201 ) ).body;
            const contact = ( await http().post( `/projects/clients/${client.id}/contacts` ).set( auth( memberToken ) )
                .send({ name: '김담당', email: 'kim@test.com' }).expect( 201 ) ).body;
            await http().patch( `/projects/clients/${client.id}/contacts/${contact.id}` ).set( auth( ownerToken ) ).send({ jobTitle: '과장' }).expect( 200 );

            let detail = await http().get( `/projects/clients/${client.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.contacts ).toEqual([ expect.objectContaining({ name: '김담당', jobTitle: '과장' }) ]);

            await http().delete( `/projects/clients/${client.id}/contacts/${contact.id}` ).set( auth( ownerToken ) ).expect( 200 );
            detail = await http().get( `/projects/clients/${client.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.contacts ).toHaveLength( 0 );
        });
    });

    //* 프로젝트·권한
    describe('프로젝트', () => {
        it('만든 사람은 책임자로 등록된다', async () => {
            const project = await createProject( ownerToken );
            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );

            expect( detail.body.members ).toEqual([ expect.objectContaining({ role: 'MANAGER', user: expect.objectContaining({ id: ownerId }) }) ]);
            expect( detail.body.myAccess ).toMatchObject({ memberRole: 'MANAGER', canManage: true });
        });

        it('설명·과제 내용(에디터 HTML)은 저장 시 정제된다: 스크립트·이미지 제거, 서식 유지, 빈 본문은 null', async () => {
            const project = await createProject( ownerToken, {
                description: '<p><strong>굵게</strong></p><script>alert(1)</script><img src="/api/common/files/images/2026/11/0a1b2c3d-0000-4000-8000-000000000000.png">',
            });
            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.description ).toBe( '<p><strong>굵게</strong></p>' );

            const task = await createTask( project.id, ownerToken, { description: '<p onclick="x()">내용</p>' } );
            expect( task.description ).toBe( '<p>내용</p>' );
            const emptied = await http().patch( `/projects/${project.id}/tasks/${task.id}` ).set( auth( ownerToken ) ).send({ description: '<p></p>' }).expect( 200 );
            expect( emptied.body.description ).toBeNull();
        });

        it('시작일이 종료일보다 늦으면 400 (생성·한쪽만 수정)', async () => {
            await http().post( '/projects' ).set( auth( ownerToken ) ).send({ name: 'x', startDate: '2026-12-31', endDate: '2026-12-01' }).expect( 400 );

            const project = await createProject( ownerToken, { startDate: '2026-12-01', endDate: '2026-12-31' } );
            await http().patch( `/projects/${project.id}` ).set( auth( ownerToken ) ).send({ startDate: '2027-01-15' }).expect( 400 );
        });

        it('참여하지 않은 회원은 403, 과제 관리 관리자는 모든 프로젝트를 본다', async () => {
            const project = await createProject( ownerToken );
            await http().get( `/projects/${project.id}` ).set( auth( outsiderToken ) ).expect( 403 );

            const res = await http().get( `/projects/${project.id}` ).set( auth( adminToken ) ).expect( 200 );
            expect( res.body.myAccess ).toMatchObject({ memberRole: null, isAdmin: true, canManage: true });
        });

        // 2026-11-17 사용자 결정: 전체 목록은 누구나(목록만 공개), 상세는 여전히 참여자·관리자만
        it('전체 목록(scope=all)은 누구나 보되 설명은 빠지고, 참여하지 않은 프로젝트의 상세는 403', async () => {
            const project = await createProject( ownerToken, { name: '목록 확인용', description: '<p>내부 설명</p>' } );

            const all = await http().get( '/projects' ).set( auth( outsiderToken ) ).query({ scope: 'all', search: '목록 확인용' }).expect( 200 );
            const row = all.body.data.find( ( p: { id: number } ) => p.id === project.id );
            expect( row ).toMatchObject({ isMember: false, canOpen: false });
            expect( row ).not.toHaveProperty( 'description' );
            await http().get( `/projects/${project.id}` ).set( auth( outsiderToken ) ).expect( 403 );
            await http().get( `/projects/${project.id}/quotes` ).set( auth( outsiderToken ) ).expect( 403 );

            const owner = await http().get( '/projects' ).set( auth( ownerToken ) ).query({ scope: 'all', search: '목록 확인용' }).expect( 200 );
            expect( owner.body.data.find( ( p: { id: number } ) => p.id === project.id ) ).toMatchObject({ isMember: true, canOpen: true });
            const admin = await http().get( '/projects' ).set( auth( adminToken ) ).query({ scope: 'all', search: '목록 확인용' }).expect( 200 );
            expect( admin.body.data.find( ( p: { id: number } ) => p.id === project.id ) ).toMatchObject({ isMember: false, canOpen: true });

            const mine = await http().get( '/projects' ).set( auth( outsiderToken ) ).query({ search: '목록 확인용' }).expect( 200 );
            expect( mine.body.data ).toHaveLength( 0 );
        });

        it('참여자는 프로젝트를 수정할 수 없다(403)', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            await http().patch( `/projects/${project.id}` ).set( auth( memberToken ) ).send({ name: '바꿈' }).expect( 403 );

            const detail = await http().get( `/projects/${project.id}` ).set( auth( memberToken ) ).expect( 200 );
            expect( detail.body.myAccess ).toEqual({ memberRole: 'MEMBER', isAdmin: false, canManage: false });
        });

        it('책임자가 삭제하면 404, 관리자가 복구하면 다시 보인다', async () => {
            const project = await createProject( ownerToken );
            await http().delete( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 404 );

            await http().patch( `/projects/${project.id}/restore` ).set( auth( ownerToken ) ).expect( 403 ); // 관리자만
            await http().patch( `/projects/${project.id}/restore` ).set( auth( adminToken ) ).expect( 200 );
            await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
        });
    });

    //* 견적서 (docs/design/projects.md 5-1장) - .env.test는 결재가 켜져 있어 확정은 결재로 한다
    describe('견적서', () => {
        let approverToken: string;
        let approverId: number;
        let clientId: number;
        let contactId: number;

        const items = [
            { name: '설계', spec: 'M/M', quantity: 3, unitPrice: 11_111 },
            { name: '개발', quantity: 1, unitPrice: 1_000_000, note: '1식' },
        ]; // 공급가액 1,033,333 → 부가세 103,333(버림) → 합계 1,136,666

        beforeAll( async () => {
            const approver = await createTestUser( prisma, UserRole.USER );
            approverId = approver.id;
            approverToken = await loginAs( app, approver.empNo );
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '견적상사', businessNo: '9998887777' }).expect( 201 ) ).body;
            clientId = client.id;
            contactId = ( await http().post( `/projects/clients/${clientId}/contacts` ).set( auth( ownerToken ) ).send({ name: '이수신' }).expect( 201 ) ).body.id;
        });

        const newQuote = async ( projectId: number, body: Record<string, unknown> = {} ) =>
            ( await http().post( `/projects/${projectId}/quotes` ).set( auth( memberToken ) ).send({ title: '1차 견적', items, ...body }).expect( 201 ) ).body;
        const detail = async ( projectId: number, quoteId: number ) =>
            ( await http().get( `/projects/${projectId}/quotes/${quoteId}` ).set( auth( memberToken ) ).expect( 200 ) ).body;
        const submit = ( projectId: number, quoteId: number, versionId: number ) =>
            http().post( `/projects/${projectId}/quotes/${quoteId}/versions/${versionId}/submit` ).set( auth( memberToken ) ).send({ steps: [ { approverIds: [ approverId ] } ] });

        const quoteProject = async () => {
            const project = await createProject( ownerToken, { clientId } );
            await addMember( project.id, memberId );
            return project;
        };

        it('발주처가 없는 프로젝트는 견적을 만들 수 없다 (400)', async () => {
            const project = await createProject( ownerToken );
            await http().post( `/projects/${project.id}/quotes` ).set( auth( ownerToken ) ).send({ title: 'x' }).expect( 400 );
        });

        it('만들면 연도별 번호 + v1, 금액·부가세(합계 기준 버림)를 서버가 계산하고 발주처·담당자를 스냅샷한다', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id, { contactId, quoteDate: '2026-11-17', validUntil: '2026-12-17' } );
            expect( quote.quoteNo ).toMatch( /^Q-2026-\d{4}$/ );

            const d = await detail( project.id, quote.id );
            const v1 = d.versions[0];
            expect( v1 ).toMatchObject({
                version: 1, displayStatus: 'DRAFT', isLatest: true,
                supplyAmount: '1033333', vatAmount: '103333', totalAmount: '1136666',
                clientName: '견적상사', clientBusinessNo: '9998887777', contactName: '이수신',
            });
            expect( v1.items.map( ( i: { amount: string } ) => i.amount ) ).toEqual([ '33333', '1000000' ]);

            // 스냅샷: 거래처 이름을 바꿔도 이미 저장된 버전은 그대로
            await http().patch( `/projects/clients/${clientId}` ).set( auth( ownerToken ) ).send({ name: '견적상사(변경)' }).expect( 200 );
            expect( ( await detail( project.id, quote.id ) ).versions[0].clientName ).toBe( '견적상사' );
            await http().patch( `/projects/clients/${clientId}` ).set( auth( ownerToken ) ).send({ name: '견적상사' }).expect( 200 );
        });

        it('면세면 부가세 0, 유효기간이 견적일보다 앞이면 400, 다른 거래처 담당자는 400', async () => {
            const project = await quoteProject();
            const exempt = await newQuote( project.id, { taxType: 'EXEMPT' } );
            expect( ( await detail( project.id, exempt.id ) ).versions[0] ).toMatchObject({ vatAmount: '0', totalAmount: '1033333' });

            // 부가세율 직접 입력: 1,033,333 × 5% = 51,666.65 → 51,666
            const rated = await newQuote( project.id, { vatRate: 5 } );
            expect( ( await detail( project.id, rated.id ) ).versions[0] ).toMatchObject({ vatRate: '5', vatAmount: '51666', totalAmount: '1084999' });
            await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: 'x', vatRate: 100.01 }).expect( 400 );

            await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: 'x', quoteDate: '2026-11-17', validUntil: '2026-11-01' }).expect( 400 );
            const other = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '남의상사' }).expect( 201 ) ).body;
            const otherContact = ( await http().post( `/projects/clients/${other.id}/contacts` ).set( auth( ownerToken ) ).send({ name: '남' }).expect( 201 ) ).body;
            await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: 'x', contactId: otherContact.id }).expect( 400 );
        });

        it('⭐ 동시에 여러 견적을 만들어도 견적번호가 겹치지 않는다 (채번 행 잠금)', async () => {
            const project = await quoteProject();
            const results = await Promise.all( Array.from({ length: 5 }, () =>
                http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: '동시', items }) ) );
            expect( results.every( ( r ) => r.status === 201 ) ).toBe( true );
            expect( new Set( results.map( ( r ) => r.body.quoteNo ) ).size ).toBe( 5 );
        });

        it('결재가 켜져 있으면 직접 확정은 400, 품목이 없으면 상신 400', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id );
            const v1 = ( await detail( project.id, quote.id ) ).versions[0];
            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}/confirm` ).set( auth( memberToken ) ).expect( 400 );

            const empty = await newQuote( project.id, { items: [] } );
            const ev = ( await detail( project.id, empty.id ) ).versions[0];
            await submit( project.id, empty.id, ev.id ).expect( 400 );
            expect( ( await detail( project.id, empty.id ) ).versions[0].displayStatus ).toBe( 'DRAFT' ); // 실패해도 작성 중
        });

        it('⭐ 결재 상신 → 결재 중(수정·새 버전 불가) → 최종 승인 시 확정, 결재 본문에 견적 스냅샷, 계약 금액 = 확정 합계', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id );
            const v1 = ( await detail( project.id, quote.id ) ).versions[0];

            const { approvalDocumentId } = ( await submit( project.id, quote.id, v1.id ).expect( 201 ) ).body;
            let d = await detail( project.id, quote.id );
            expect( d.versions[0] ).toMatchObject({ displayStatus: 'IN_APPROVAL', approvalDocument: { id: approvalDocumentId, status: 'REQUESTED' } });

            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}` ).set( auth( memberToken ) ).send({ note: 'x' }).expect( 400 );
            await http().post( `/projects/${project.id}/quotes/${quote.id}/versions` ).set( auth( memberToken ) ).expect( 400 );
            await submit( project.id, quote.id, v1.id ).expect( 400 ); // 이미 결재 중

            const doc = await http().get( `/approvals/documents/${approvalDocumentId}` ).set( auth( approverToken ) ).expect( 200 );
            expect( doc.body.documentType ).toBe( 'QUOTE' );
            expect( doc.body.content ).toContain( '<table>' );
            expect( doc.body.content ).toContain( '1,136,666원' );

            await http().patch( `/approvals/documents/${approvalDocumentId}/approve` ).set( auth( approverToken ) ).send({}).expect( 200 );
            d = await detail( project.id, quote.id );
            expect( d.versions[0].displayStatus ).toBe( 'CONFIRMED' );

            await http().post( `/projects/${project.id}/quotes/${quote.id}/versions` ).set( auth( memberToken ) ).expect( 400 ); // 확정 견적은 새 버전 불가
            const list = await http().get( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).expect( 200 );
            expect( list.body ).toMatchObject({ approvalEnabled: true, contractAmount: '1136666' });

            // 결재함의 "다시 기안"은 견적 문서에 쓸 수 없다 (처리기에 onCopy 없음)
            await http().post( `/approvals/documents/${approvalDocumentId}/copy` ).set( auth( memberToken ) ).expect( ( r ) => expect( r.status ).toBeGreaterThanOrEqual( 400 ) );
        });

        it('반려되면 고쳐서 다시 올릴 수 있고, 새 결재 문서로 연결된다', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id );
            const v1 = ( await detail( project.id, quote.id ) ).versions[0];
            const first = ( await submit( project.id, quote.id, v1.id ).expect( 201 ) ).body.approvalDocumentId;
            await http().patch( `/approvals/documents/${first}/reject` ).set( auth( approverToken ) ).send({ comment: '단가 조정' }).expect( 200 );
            expect( ( await detail( project.id, quote.id ) ).versions[0].displayStatus ).toBe( 'REJECTED' );

            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}` ).set( auth( memberToken ) )
                .send({ items: [ { name: '설계', quantity: 1, unitPrice: 500_000 } ] }).expect( 200 );
            const second = ( await submit( project.id, quote.id, v1.id ).expect( 201 ) ).body.approvalDocumentId;
            expect( second ).not.toBe( first );
            expect( ( await detail( project.id, quote.id ) ).versions[0] ).toMatchObject({ displayStatus: 'IN_APPROVAL', totalAmount: '550000' });
        });

        it('새 버전: 최신을 복사해 v2(작성 중), 이전 버전은 고칠 수 없다. v2 삭제 가능, v1은 견적 삭제로', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id );
            const v1 = ( await detail( project.id, quote.id ) ).versions[0];
            const v2 = ( await http().post( `/projects/${project.id}/quotes/${quote.id}/versions` ).set( auth( memberToken ) ).expect( 201 ) ).body;
            expect( v2.version ).toBe( 2 );

            const d = await detail( project.id, quote.id );
            expect( d.versions.map( ( v: { version: number; items: unknown[] } ) => [ v.version, v.items.length ] ) ).toEqual([ [ 2, 2 ], [ 1, 2 ] ]);
            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}` ).set( auth( memberToken ) ).send({ note: 'x' }).expect( 400 );

            await http().delete( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}` ).set( auth( memberToken ) ).expect( 400 );
            await http().delete( `/projects/${project.id}/quotes/${quote.id}/versions/${v2.id}` ).set( auth( memberToken ) ).expect( 200 );
            await http().delete( `/projects/${project.id}/quotes/${quote.id}` ).set( auth( memberToken ) ).expect( 200 );
            await http().get( `/projects/${project.id}/quotes/${quote.id}` ).set( auth( memberToken ) ).expect( 404 );
        });

        it('확정 취소: "취소됨"으로 남고 계약 금액에서 빠지며, 확정 버전이 있는 견적은 삭제할 수 없다', async () => {
            const project = await quoteProject();
            const quote = await newQuote( project.id );
            const v1 = ( await detail( project.id, quote.id ) ).versions[0];
            const docId = ( await submit( project.id, quote.id, v1.id ).expect( 201 ) ).body.approvalDocumentId;
            await http().patch( `/approvals/documents/${docId}/approve` ).set( auth( approverToken ) ).send({}).expect( 200 );

            await http().delete( `/projects/${project.id}/quotes/${quote.id}` ).set( auth( memberToken ) ).expect( 400 );
            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}/cancel` ).set( auth( memberToken ) ).expect( 200 );
            expect( ( await detail( project.id, quote.id ) ).versions[0].displayStatus ).toBe( 'CANCELLED' );
            expect( ( await http().get( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).expect( 200 ) ).body.contractAmount ).toBe( '0' );
            await http().patch( `/projects/${project.id}/quotes/${quote.id}/versions/${v1.id}/cancel` ).set( auth( memberToken ) ).expect( 400 ); // 이미 취소
        });

        it('참여하지 않은 회원은 403, 품목 수량 0·소수 단가는 400', async () => {
            const project = await quoteProject();
            await http().get( `/projects/${project.id}/quotes` ).set( auth( outsiderToken ) ).expect( 403 );
            await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: 'x', items: [ { name: 'a', quantity: 0, unitPrice: 1 } ] }).expect( 400 );
            await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) ).send({ title: 'x', items: [ { name: 'a', quantity: 1, unitPrice: 1.5 } ] }).expect( 400 );
        });
    });

    //* 매출 (docs/design/projects.md 5-2장)
    describe('매출', () => {
        let approverToken: string;
        let approverId: number;
        let clientId: number;

        beforeAll( async () => {
            const approver = await createTestUser( prisma, UserRole.USER );
            approverId = approver.id;
            approverToken = await loginAs( app, approver.empNo );
            clientId = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '매출상사' }).expect( 201 ) ).body.id;
        });

        const salesUrl = ( projectId: number ) => `/projects/${projectId}/sales`;
        const list = async ( projectId: number ) => ( await http().get( salesUrl( projectId ) ).set( auth( memberToken ) ).expect( 200 ) ).body;
        const createSale = async ( projectId: number, body: Record<string, unknown> ) =>
            ( await http().post( salesUrl( projectId ) ).set( auth( memberToken ) ).send({ title: '청구', ...body }).expect( 201 ) ).body;

        // 확정 견적 하나 (공급가액 1,000,000 → 합계 1,100,000) 를 가진 프로젝트
        const projectWithConfirmedQuote = async () => {
            const project = await createProject( ownerToken, { clientId } );
            await addMember( project.id, memberId );
            const quote = ( await http().post( `/projects/${project.id}/quotes` ).set( auth( memberToken ) )
                .send({ title: '견적', items: [ { name: '개발', quantity: 1, unitPrice: 1_000_000 } ] }).expect( 201 ) ).body;
            const versionId = ( await http().get( `/projects/${project.id}/quotes/${quote.id}` ).set( auth( memberToken ) ).expect( 200 ) ).body.versions[0].id;
            const docId = ( await http().post( `/projects/${project.id}/quotes/${quote.id}/versions/${versionId}/submit` ).set( auth( memberToken ) )
                .send({ steps: [ { approverIds: [ approverId ] } ] }).expect( 201 ) ).body.approvalDocumentId;
            await http().patch( `/approvals/documents/${docId}/approve` ).set( auth( approverToken ) ).send({}).expect( 200 );
            return { project, quoteId: quote.id, versionId };
        };

        it('견적 없이도 등록, 공급가액 → 부가세 자동(과세 버림·면세 0), 청구일이 있으면 바로 청구', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const planned = await createSale( project.id, { supplyAmount: 33_333, plannedDate: '2026-12-01' } );
            expect( planned ).toMatchObject({ status: 'PLANNED', vatAmount: '3333', totalAmount: '36666', quoteVersionId: null });

            const billed = await createSale( project.id, { supplyAmount: 1000, taxType: 'EXEMPT', billedDate: '2026-11-17' } );
            expect( billed ).toMatchObject({ status: 'BILLED', vatAmount: '0', totalAmount: '1000' });

            // 부가세율 직접 입력 (기본 10%)
            const rated = await createSale( project.id, { supplyAmount: 1000, vatRate: 5, plannedDate: '2026-12-01' } );
            expect( rated ).toMatchObject({ vatRate: '5', vatAmount: '50', totalAmount: '1050' });
            await http().patch( `${salesUrl( project.id )}/${rated.id}` ).set( auth( memberToken ) ).send({ vatRate: 0 }).expect( 200 );
            await http().delete( `${salesUrl( project.id )}/${rated.id}` ).set( auth( memberToken ) ).expect( 200 );

            const body = await list( project.id );
            expect( body.summary ).toMatchObject({ billedTotal: '1000', plannedTotal: '36666', paidTotal: '0', outstanding: '1000' });
        });

        it('⭐ 분할 청구: 견적에 연결한 청구 합계는 견적 금액 이하 (같으면 허용, 넘으면 400, 취소된 청구는 빠진다)', async () => {
            const { project, versionId } = await projectWithConfirmedQuote();
            await createSale( project.id, { title: '계약금', quoteVersionId: versionId, supplyAmount: 300_000 } );   // 330,000
            await http().post( salesUrl( project.id ) ).set( auth( memberToken ) )
                .send({ title: '잔금', quoteVersionId: versionId, supplyAmount: 700_001 }).expect( 400 );            // 770,001 → 초과
            const rest = await createSale( project.id, { title: '잔금', quoteVersionId: versionId, supplyAmount: 700_000, billedDate: '2026-11-17' } ); // 딱 맞음

            let body = await list( project.id );
            expect( body.confirmedQuotes[0] ).toMatchObject({ id: versionId, totalAmount: '1100000', billedAmount: '1100000', remaining: '0' });

            await http().patch( `${salesUrl( project.id )}/${rest.id}/cancel` ).set( auth( memberToken ) ).expect( 200 );
            body = await list( project.id );
            expect( body.confirmedQuotes[0].remaining ).toBe( '770000' );
        });

        it('⭐ 동시에 같은 견적으로 청구해도 합계가 넘지 않는다 (견적 행 잠금)', async () => {
            const { project, versionId } = await projectWithConfirmedQuote();
            const results = await Promise.all( Array.from({ length: 3 }, () =>
                http().post( salesUrl( project.id ) ).set( auth( memberToken ) ).send({ title: '동시', quoteVersionId: versionId, supplyAmount: 500_000 }) ) );
            expect( results.filter( ( r ) => r.status === 201 ) ).toHaveLength( 2 ); // 550,000 × 2 = 1,100,000
            expect( ( await list( project.id ) ).confirmedQuotes[0].remaining ).toBe( '0' );
        });

        it('확정 견적이 아니면 연결 불가, 매출이 연결된 견적은 확정 취소 불가', async () => {
            const { project, quoteId, versionId } = await projectWithConfirmedQuote();
            const sale = await createSale( project.id, { quoteVersionId: versionId, supplyAmount: 100 } );
            await http().patch( `/projects/${project.id}/quotes/${quoteId}/versions/${versionId}/cancel` ).set( auth( memberToken ) ).expect( 400 );

            await http().delete( `${salesUrl( project.id )}/${sale.id}` ).set( auth( memberToken ) ).expect( 200 );
            await http().patch( `/projects/${project.id}/quotes/${quoteId}/versions/${versionId}/cancel` ).set( auth( memberToken ) ).expect( 200 );
            await http().post( salesUrl( project.id ) ).set( auth( memberToken ) ).send({ title: 'x', quoteVersionId: versionId, supplyAmount: 1 }).expect( 400 );
        });

        it('청구 → 부분 수금 → 완료, 수금 합계가 청구 금액을 넘으면 400, 수금이 있으면 취소 불가', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const sale = await createSale( project.id, { supplyAmount: 100_000, plannedDate: '2026-12-01' } );        // 110,000
            await http().post( `${salesUrl( project.id )}/${sale.id}/payments` ).set( auth( memberToken ) ).send({ paidDate: '2026-12-02', amount: 1 }).expect( 400 ); // 청구 전

            await http().patch( `${salesUrl( project.id )}/${sale.id}/bill` ).set( auth( memberToken ) ).send({ billedDate: '2026-12-01', taxInvoiceNo: '20261201-41000000-12345678' }).expect( 200 );
            await http().patch( `${salesUrl( project.id )}/${sale.id}` ).set( auth( memberToken ) ).send({ supplyAmount: 1 }).expect( 400 ); // 청구 후 금액 잠금

            const p1 = ( await http().post( `${salesUrl( project.id )}/${sale.id}/payments` ).set( auth( memberToken ) ).send({ paidDate: '2026-12-05', amount: 60_000 }).expect( 201 ) ).body;
            let row = ( await list( project.id ) ).sales[0];
            expect( row ).toMatchObject({ status: 'BILLED', paidAmount: '60000', paymentStatus: 'PARTIAL', taxInvoiceNo: '20261201-41000000-12345678' });

            await http().post( `${salesUrl( project.id )}/${sale.id}/payments` ).set( auth( memberToken ) ).send({ paidDate: '2026-12-06', amount: 50_001 }).expect( 400 );
            await http().post( `${salesUrl( project.id )}/${sale.id}/payments` ).set( auth( memberToken ) ).send({ paidDate: '2026-12-06', amount: 50_000 }).expect( 201 );
            row = ( await list( project.id ) ).sales[0];
            expect( row ).toMatchObject({ paidAmount: '110000', paymentStatus: 'PAID' });

            await http().patch( `${salesUrl( project.id )}/${sale.id}/cancel` ).set( auth( memberToken ) ).expect( 400 );
            await http().delete( `${salesUrl( project.id )}/${sale.id}` ).set( auth( memberToken ) ).expect( 400 ); // 청구한 건은 삭제 불가
            await http().delete( `${salesUrl( project.id )}/${sale.id}/payments/${p1.id}` ).set( auth( memberToken ) ).expect( 200 );
            expect( ( await list( project.id ) ).sales[0].paymentStatus ).toBe( 'PARTIAL' );
        });

        it('세금계산서 첨부·다운로드(참여자만), 청구 뒤에도 추가 첨부(수정본)', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const upload = async ( name: string ) =>
                ( await http().post( '/common/files/attachments' ).set( auth( memberToken ) ).attach( 'file', Buffer.from( name ), name ).expect( 201 ) ).body.id;

            const first = await upload( 'invoice.pdf' );
            const sale = await createSale( project.id, { supplyAmount: 1000, billedDate: '2026-11-17', attachmentIds: [ first ] } );
            const second = await upload( 'invoice-fixed.pdf' );
            await http().patch( `${salesUrl( project.id )}/${sale.id}` ).set( auth( memberToken ) ).send({ attachmentIds: [ first, second ] }).expect( 200 );

            const row = ( await list( project.id ) ).sales[0];
            expect( row.files.map( ( f: { id: number } ) => f.id ) ).toEqual([ first, second ]);
            await http().get( `${salesUrl( project.id )}/${sale.id}/files/${second}` ).set( auth( memberToken ) ).expect( 200 );
            await http().get( `${salesUrl( project.id )}/${sale.id}/files/${second}` ).set( auth( outsiderToken ) ).expect( 403 );
        });
    });

    //* 예산 (docs/design/projects.md 5-3장)
    describe('예산', () => {
        const categoriesUrl = '/projects/budget-categories';
        const budgetsUrl = ( projectId: number ) => `/projects/${projectId}/budgets`;
        const expensesUrl = ( projectId: number ) => `${budgetsUrl( projectId )}/expenses`;
        let seq = 0;

        const createCategory = async ( name = `항목${++seq}` ) =>
            ( await http().post( categoriesUrl ).set( auth( adminToken ) ).send({ name }).expect( 201 ) ).body;
        const budget = async ( projectId: number ) =>
            ( await http().get( budgetsUrl( projectId ) ).set( auth( memberToken ) ).expect( 200 ) ).body;
        const saveBudgets = ( projectId: number, items: { categoryId: number; amount: number }[] ) =>
            http().put( budgetsUrl( projectId ) ).set( auth( memberToken ) ).send({ items });
        const createExpense = async ( projectId: number, body: Record<string, unknown> ) =>
            ( await http().post( expensesUrl( projectId ) ).set( auth( memberToken ) )
                .send({ title: '지출', expenseDate: '2026-11-10', supplyAmount: 1000, ...body }).expect( 201 ) ).body;
        const memberProject = async ( body: Record<string, unknown> = {} ) => {
            const project = await createProject( ownerToken, body );
            await addMember( project.id, memberId );
            return project;
        };

        it('비용 항목: 관리자만 관리, 이름 중복 409, 숨기면 목록에서 빠지고 같은 이름을 다시 만들 수 있다', async () => {
            const category = await createCategory( '인건비' );
            await http().post( categoriesUrl ).set( auth( memberToken ) ).send({ name: '남의 항목' }).expect( 403 );
            await http().post( categoriesUrl ).set( auth( adminToken ) ).send({ name: ' 인건비 ' }).expect( 409 );
            await http().post( categoriesUrl ).set( auth( adminToken ) ).send({ name: '   ' }).expect( 400 );

            await http().patch( `${categoriesUrl}/${category.id}` ).set( auth( adminToken ) ).send({ name: '인건비(정규)' }).expect( 200 );
            await http().delete( `${categoriesUrl}/${category.id}` ).set( auth( memberToken ) ).expect( 403 );
            await http().delete( `${categoriesUrl}/${category.id}` ).set( auth( adminToken ) ).expect( 200 );

            const list = ( await http().get( categoriesUrl ).set( auth( memberToken ) ).expect( 200 ) ).body;
            expect( list.map( ( c: { id: number } ) => c.id ) ).not.toContain( category.id );
            await createCategory( '인건비(정규)' );
        });

        it('예산 대비 지출은 공급가액으로 비교하고, 넘어도 저장하며 경고만 준다', async () => {
            const project = await memberProject();
            const category = await createCategory();
            await saveBudgets( project.id, [ { categoryId: category.id, amount: 1000 } ] ).expect( 200 );

            // 공급가액 1,000 = 예산과 같음 → 초과 아님 (부가세 100은 비교에 넣지 않는다)
            const first = await createExpense( project.id, { categoryId: category.id } );
            expect( first ).toMatchObject({ supplyAmount: '1000', vatAmount: '100', totalAmount: '1100', budgetWarning: null });

            // 1원 넘으면 저장되고 경고
            const second = await createExpense( project.id, { categoryId: category.id, supplyAmount: 1, taxType: 'EXEMPT' } );
            expect( second.budgetWarning ).toMatchObject({ budgetAmount: '1000', spentAmount: '1001', overAmount: '1' });

            const body = await budget( project.id );
            expect( body.summary ).toMatchObject({ budgetTotal: '1000', spentTotal: '1001', remaining: '-1' });
            expect( body.categories[0] ).toMatchObject({ categoryId: category.id, spentAmount: '1001', over: true });
            expect( body.expenses ).toHaveLength( 2 );
            expect( body.monthlyExpenses ).toHaveLength( 12 );

            // 삭제하면 합계에서 빠진다
            await http().delete( `${expensesUrl( project.id )}/${second.id}` ).set( auth( memberToken ) ).expect( 200 );
            expect( ( await budget( project.id ) ).categories[0] ).toMatchObject({ spentAmount: '1000', over: false });
        });

        it('예산 저장은 목록 전체 교체, 같은 항목 두 번은 400, 참여하지 않은 회원은 403', async () => {
            const project = await memberProject();
            const a = await createCategory();
            const b = await createCategory();
            await saveBudgets( project.id, [ { categoryId: a.id, amount: 100 }, { categoryId: b.id, amount: 200 } ] ).expect( 200 );
            await saveBudgets( project.id, [ { categoryId: b.id, amount: 300 } ] ).expect( 200 );

            const body = await budget( project.id );
            expect( body.categories.map( ( c: { categoryId: number; budgetAmount: string } ) => [ c.categoryId, c.budgetAmount ] ) ).toEqual([ [ b.id, '300' ] ]);

            await saveBudgets( project.id, [ { categoryId: a.id, amount: 1 }, { categoryId: a.id, amount: 2 } ] ).expect( 400 );
            await http().get( budgetsUrl( project.id ) ).set( auth( outsiderToken ) ).expect( 403 );
            await http().put( budgetsUrl( project.id ) ).set( auth( outsiderToken ) ).send({ items: [] }).expect( 403 );
        });

        it('숨긴 항목은 새로 고를 수 없지만 이미 쓴 예산·지출은 이름과 함께 남는다', async () => {
            const project = await memberProject();
            const category = await createCategory( '폐지될 항목' );
            await saveBudgets( project.id, [ { categoryId: category.id, amount: 500 } ] ).expect( 200 );
            const expense = await createExpense( project.id, { categoryId: category.id } );
            await http().delete( `${categoriesUrl}/${category.id}` ).set( auth( adminToken ) ).expect( 200 );

            await http().post( expensesUrl( project.id ) ).set( auth( memberToken ) )
                .send({ categoryId: category.id, title: 'x', expenseDate: '2026-11-10', supplyAmount: 1 }).expect( 400 );
            const other = await memberProject();
            await saveBudgets( other.id, [ { categoryId: category.id, amount: 1 } ] ).expect( 400 );

            // 기존 행은 그대로: 금액 수정 가능, 지출 수정 가능
            await saveBudgets( project.id, [ { categoryId: category.id, amount: 700 } ] ).expect( 200 );
            await http().patch( `${expensesUrl( project.id )}/${expense.id}` ).set( auth( memberToken ) ).send({ title: '고침' }).expect( 200 );
            expect( ( await budget( project.id ) ).categories[0] ).toMatchObject({ name: '폐지될 항목', deleted: true, budgetAmount: '700' });
        });

        it('지출에 협력사를 고르면 계약 금액 대비 지급액을 보여 주고, 예산 금액은 바뀌지 않는다', async () => {
            const project = await memberProject();
            const category = await createCategory();
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '지급상사' }).expect( 201 ) ).body;
            const partner = ( await http().post( `/projects/${project.id}/partners` ).set( auth( memberToken ) )
                .send({ clientId: client.id, contractAmount: 2000 }).expect( 201 ) ).body;
            await saveBudgets( project.id, [ { categoryId: category.id, amount: 5000 } ] ).expect( 200 );

            await createExpense( project.id, { categoryId: category.id, partnerId: partner.id, supplyAmount: 500 } );
            const body = await budget( project.id );
            // 계약 금액과는 공급가액으로 비교하고, 실제 지급액(부가세 포함)은 따로 알려 준다
            expect( body.partners ).toEqual([ expect.objectContaining({ partnerId: partner.id, contractAmount: '2000', paidAmount: '500', paidTotalAmount: '550', remaining: '1500', removed: false }) ]);
            expect( body.summary.budgetTotal ).toBe( '5000' );

            // 다른 프로젝트의 협력사는 400
            const other = await memberProject();
            await http().post( expensesUrl( other.id ) ).set( auth( memberToken ) )
                .send({ categoryId: category.id, partnerId: partner.id, title: 'x', expenseDate: '2026-11-10', supplyAmount: 1 }).expect( 400 );

            // 협력사를 빼도 지급 기록은 남고, 새로 고를 수는 없다
            await http().delete( `/projects/${project.id}/partners/${partner.id}` ).set( auth( memberToken ) ).expect( 200 );
            expect( ( await budget( project.id ) ).partners[0] ).toMatchObject({ partnerId: partner.id, removed: true, paidAmount: '500' });
            await http().post( expensesUrl( project.id ) ).set( auth( memberToken ) )
                .send({ categoryId: category.id, partnerId: partner.id, title: 'x', expenseDate: '2026-11-10', supplyAmount: 1 }).expect( 400 );
        });

        it('입력 검증과 증빙 첨부·다운로드(참여자만)', async () => {
            const project = await memberProject();
            const category = await createCategory();
            const url = expensesUrl( project.id );
            const valid = { categoryId: category.id, title: 'x', expenseDate: '2026-11-10', supplyAmount: 1 };
            await http().post( url ).set( auth( memberToken ) ).send({ ...valid, supplyAmount: 0 }).expect( 400 );
            await http().post( url ).set( auth( memberToken ) ).send({ ...valid, supplyAmount: 10.5 }).expect( 400 );
            await http().post( url ).set( auth( memberToken ) ).send({ ...valid, vatRate: 101 }).expect( 400 );
            await http().post( url ).set( auth( memberToken ) ).send({ ...valid, expenseDate: '2026/11/10' }).expect( 400 );

            const fileId = ( await http().post( '/common/files/attachments' ).set( auth( memberToken ) ).attach( 'file', Buffer.from( 'receipt' ), 'receipt.pdf' ).expect( 201 ) ).body.id;
            const expense = await createExpense( project.id, { categoryId: category.id, attachmentIds: [ fileId ] } );
            expect( ( await budget( project.id ) ).expenses[0].files.map( ( f: { id: number } ) => f.id ) ).toEqual([ fileId ]);
            await http().get( `${url}/${expense.id}/files/${fileId}` ).set( auth( memberToken ) ).expect( 200 );
            await http().get( `${url}/${expense.id}/files/${fileId}` ).set( auth( outsiderToken ) ).expect( 403 );
        });

        it('전사 통계: 관리자만, 이번 달 매출·지출과 거래처 순위에 반영되고 삭제된 프로젝트는 빠진다', async () => {
            await http().get( '/projects/stats' ).set( auth( memberToken ) ).expect( 403 );
            const stats = async () => ( await http().get( '/projects/stats' ).set( auth( adminToken ) ).expect( 200 ) ).body;
            const today = kstDateString( new Date() );
            const thisMonth = ( rows: { month: string; amount: string }[] ) => BigInt( rows.find( ( r ) => r.month === today.slice( 0, 7 ) )!.amount );

            const before = await stats();
            const client = ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name: '순위상사' }).expect( 201 ) ).body;
            const project = await memberProject({ clientId: client.id });
            const category = await createCategory();
            await http().post( `/projects/${project.id}/sales` ).set( auth( memberToken ) ).send({ title: '청구', supplyAmount: 1000, billedDate: today }).expect( 201 );
            await http().post( `/projects/${project.id}/sales` ).set( auth( memberToken ) ).send({ title: '예정', supplyAmount: 9000 }).expect( 201 ); // 청구 예정은 매출이 아니다
            await createExpense( project.id, { categoryId: category.id, supplyAmount: 300, expenseDate: today } );

            const after = await stats();
            expect( after.monthlySales ).toHaveLength( 12 );
            expect( thisMonth( after.monthlySales ) - thisMonth( before.monthlySales ) ).toBe( BigInt( 1100 ) );
            expect( thisMonth( after.monthlyExpenses ) - thisMonth( before.monthlyExpenses ) ).toBe( BigInt( 300 ) );
            expect( after.topClients ).toEqual( expect.arrayContaining([ expect.objectContaining({ clientId: client.id, name: '순위상사', amount: '1100' }) ]) );
            expect( after.categories ).toEqual( expect.arrayContaining([ expect.objectContaining({ categoryId: category.id, spentAmount: '300' }) ]) );

            await http().delete( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            const removed = await stats();
            expect( thisMonth( removed.monthlySales ) ).toBe( thisMonth( before.monthlySales ) );
            expect( removed.topClients.map( ( c: { clientId: number } ) => c.clientId ) ).not.toContain( client.id );
        });

        it('전사 통계 필터: 지난 연도, 프로젝트, 거래처로 조회하고 기본값은 최근 12개월이다', async () => {
            const stats = async ( query: Record<string, number> ) =>
                ( await http().get( '/projects/stats' ).query( query ).set( auth( adminToken ) ).expect( 200 ) ).body;
            const amountOf = ( rows: { month: string; amount: string }[], month: string ) => rows.find( ( r ) => r.month === month )?.amount;
            const newClient = async ( name: string ) => ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name }).expect( 201 ) ).body;

            const clientA = await newClient( '필터상사A' );
            const clientB = await newClient( '필터상사B' );
            const projectA = await memberProject({ clientId: clientA.id });
            const projectB = await memberProject({ clientId: clientB.id });
            const category = await createCategory();
            await http().post( `/projects/${projectA.id}/sales` ).set( auth( memberToken ) ).send({ title: '청구', supplyAmount: 1000, billedDate: '2024-03-15' }).expect( 201 );
            await http().post( `/projects/${projectB.id}/sales` ).set( auth( memberToken ) ).send({ title: '청구', supplyAmount: 2000, billedDate: '2024-03-20' }).expect( 201 );
            await createExpense( projectA.id, { categoryId: category.id, supplyAmount: 300, expenseDate: '2024-04-01' } );

            // 연도 + 프로젝트: 그해 1~12월, 그 프로젝트만
            const byProject = await stats({ year: 2024, projectId: projectA.id });
            expect( byProject.monthlySales.map( ( r: { month: string } ) => r.month ).slice( 0, 2 ) ).toEqual([ '2024-01', '2024-02' ]);
            expect( byProject.monthlySales ).toHaveLength( 12 );
            expect( amountOf( byProject.monthlySales, '2024-03' ) ).toBe( '1100' );
            expect( amountOf( byProject.monthlyExpenses, '2024-04' ) ).toBe( '300' );
            expect( byProject.categories ).toEqual([ expect.objectContaining({ categoryId: category.id, spentAmount: '300' }) ]);

            // 연도 + 거래처
            const byClient = await stats({ year: 2024, clientId: clientB.id });
            expect( amountOf( byClient.monthlySales, '2024-03' ) ).toBe( '2200' );
            expect( byClient.topClients ).toEqual([ expect.objectContaining({ clientId: clientB.id, amount: '2200' }) ]);

            // 둘 다 고르면 둘 다 만족하는 것만
            const none = await stats({ year: 2024, projectId: projectA.id, clientId: clientB.id });
            expect( amountOf( none.monthlySales, '2024-03' ) ).toBe( '0' );

            // 기본값: 최근 12개월이라 지난 연도의 청구는 보이지 않는다
            const recent = await stats({ projectId: projectA.id });
            expect( recent.monthlySales.at( -1 ).month ).toBe( kstDateString( new Date() ).slice( 0, 7 ) );
            expect( recent.monthlySales.every( ( r: { amount: string } ) => r.amount === '0' ) ).toBe( true );

            // 잘못된 값·권한
            await http().get( '/projects/stats' ).query({ year: 1999 }).set( auth( adminToken ) ).expect( 400 );
            await http().get( '/projects/stats' ).query({ projectId: 'abc' }).set( auth( adminToken ) ).expect( 400 );
            await http().get( '/projects/stats/filters' ).set( auth( memberToken ) ).expect( 403 );

            // 필터 선택지
            const filters = ( await http().get( '/projects/stats/filters' ).set( auth( adminToken ) ).expect( 200 ) ).body;
            expect( filters.years ).toEqual( expect.arrayContaining([ 2024, Number( kstDateString( new Date() ).slice( 0, 4 ) ) ]) );
            expect( filters.projects ).toEqual( expect.arrayContaining([ expect.objectContaining({ id: projectA.id, clientId: clientA.id }) ]) );
            expect( filters.clients ).toEqual( expect.arrayContaining([ expect.objectContaining({ id: clientB.id, name: '필터상사B' }) ]) );
        });
    });

    //* 협력사 (하청기업)
    describe('협력사', () => {
        const createClient = async ( name: string ) =>
            ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name }).expect( 201 ) ).body;

        it('참여자 누구나 추가·수정·빼기, 금액은 문자열(Decimal)로 오고 참여자 전원이 본다', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const client = await createClient( '하청상사A' );

            const created = ( await http().post( `/projects/${project.id}/partners` ).set( auth( memberToken ) ).send({
                clientId: client.id, workScope: '디자인', contractAmount: 12_000_000, startDate: '2026-12-01', endDate: '2026-12-31',
                contacts: [ { name: '박담당', role: 'PM', hp: '010-1234-5678' }, { name: '최실무', email: 'choi@example.com' } ],
            }).expect( 201 ) ).body;
            // 기본: 과세 10% → 부가세·합계를 서버가 계산
            expect( created ).toMatchObject({
                contractAmount: '12000000', taxType: 'TAXABLE', vatRate: '10', vatAmount: '1200000', totalAmount: '13200000',
                workScope: '디자인', client: { id: client.id, name: '하청상사A' },
            });
            // 담당자 여러 명 (직접 기재, 보낸 순서대로)
            expect( created.contacts.map( ( c: { name: string; role: string | null } ) => [ c.name, c.role ] ) ).toEqual([ [ '박담당', 'PM' ], [ '최실무', null ] ]);

            // 담당자는 보내면 전체 교체, 안 보내면 그대로
            const replaced = ( await http().patch( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) )
                .send({ contacts: [ { name: '정정산', role: '정산' } ] }).expect( 200 ) ).body;
            expect( replaced.contacts.map( ( c: { name: string } ) => c.name ) ).toEqual([ '정정산' ]);
            expect( await prisma.projectPartnerContact.count({ where: { partnerId: created.id } }) ).toBe( 1 );

            // 금액만 바꿔도 저장된 과세·부가세율로 다시 계산, 부가세율만 바꿔도 다시 계산
            await http().patch( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) ).send({ contractAmount: 15_000_000 }).expect( 200 );
            const rated = ( await http().patch( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) ).send({ vatRate: 3.3 }).expect( 200 ) ).body;
            expect( rated ).toMatchObject({ contractAmount: '15000000', vatRate: '3.3', vatAmount: '495000', totalAmount: '15495000' });
            const exempt = ( await http().patch( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) ).send({ taxType: 'EXEMPT' }).expect( 200 ) ).body;
            expect( exempt ).toMatchObject({ vatAmount: '0', totalAmount: '15000000' });

            const list = await http().get( `/projects/${project.id}/partners` ).set( auth( memberToken ) ).expect( 200 );
            expect( list.body.map( ( p: { contractAmount: string } ) => p.contractAmount ) ).toEqual([ '15000000' ]);
            expect( list.body[0].contacts.map( ( c: { name: string } ) => c.name ) ).toEqual([ '정정산' ]); // 금액만 고친 수정은 담당자를 건드리지 않음

            await http().delete( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) ).expect( 200 );
            const after = await http().get( `/projects/${project.id}/partners` ).set( auth( memberToken ) ).expect( 200 );
            expect( after.body ).toHaveLength( 0 );
            expect( ( await prisma.projectPartner.findUnique({ where: { id: created.id } }) )?.deleted ).toBe( true ); // soft delete
        });

        it('같은 회사는 활성 한 행(409), 빼고 다시 넣으면 새 행', async () => {
            const project = await createProject( ownerToken );
            const client = await createClient( '하청상사B' );
            const first = ( await http().post( `/projects/${project.id}/partners` ).set( auth( ownerToken ) ).send({ clientId: client.id }).expect( 201 ) ).body;
            await http().post( `/projects/${project.id}/partners` ).set( auth( ownerToken ) ).send({ clientId: client.id }).expect( 409 );

            await http().delete( `/projects/${project.id}/partners/${first.id}` ).set( auth( ownerToken ) ).expect( 200 );
            await http().post( `/projects/${project.id}/partners` ).set( auth( ownerToken ) ).send({ clientId: client.id }).expect( 201 );
        });

        it('계약 기간 역순·음수 금액·소수 금액은 400, 참여하지 않은 회원은 403', async () => {
            const project = await createProject( ownerToken );
            const client = await createClient( '하청상사C' );
            const url = `/projects/${project.id}/partners`;
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, startDate: '2026-12-31', endDate: '2026-12-01' }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, contractAmount: -1 }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, contractAmount: 10.5 }).expect( 400 );
            // 부가세율: 0~100, 소수 둘째 자리까지
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, vatRate: 101 }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, vatRate: 3.333 }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, vatRate: -1 }).expect( 400 );
            // 담당자: 이름 필수(공백만 불가), 이메일 형식, 최대 20명
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, contacts: [ { name: '  ' } ] }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, contacts: [ { name: '김', email: 'x' } ] }).expect( 400 );
            await http().post( url ).set( auth( ownerToken ) ).send({ clientId: client.id, contacts: Array.from( { length: 21 }, ( _, i ) => ({ name: `담당${i}` }) ) }).expect( 400 );
            await http().get( url ).set( auth( outsiderToken ) ).expect( 403 );
        });

        it('거래처 목록에 발주·협력 프로젝트 수가 연결에서 계산된다', async () => {
            const client = await createClient( '양쪽상사' );
            await createProject( ownerToken, { clientId: client.id } );   // 발주처로 1
            const other = await createProject( ownerToken );
            await http().post( `/projects/${other.id}/partners` ).set( auth( ownerToken ) ).send({ clientId: client.id }).expect( 201 ); // 협력사로 1

            const list = await http().get( '/projects/clients' ).set( auth( ownerToken ) ).query({ search: '양쪽상사' }).expect( 200 );
            expect( list.body.data[0]._count ).toMatchObject({ projects: 1, partners: 1 });
        });
    });

    //* 참여자
    describe('참여자', () => {
        it('추가하면 추가된 사람에게 알림, 이미 참여 중이면 409', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );

            const notice = await prisma.notification.findFirst({
                where: { userId: memberId, actionType: NotificationActionType.PROJECT_MEMBER_ADDED, targetId: project.id },
            });
            expect( notice ).not.toBeNull();

            await http().post( `/projects/${project.id}/members` ).set( auth( ownerToken ) ).send({ userId: memberId }).expect( 409 );
        });

        it('빼면 soft delete, 다시 넣으면 새 행 (참여 이력 보존)', async () => {
            const project = await createProject( ownerToken );
            const added = await addMember( project.id, thirdId );
            await http().delete( `/projects/${project.id}/members/${added.id}` ).set( auth( ownerToken ) ).expect( 200 );
            await addMember( project.id, thirdId );

            const rows = await prisma.projectMember.findMany({ where: { projectId: project.id, userId: thirdId }, orderBy: { id: 'asc' } });
            expect( rows.map( ( r ) => r.deleted ) ).toEqual([ true, false ]);
        });

        it('마지막 책임자는 빼거나 참여자로 바꿀 수 없다 (400)', async () => {
            const project = await createProject( ownerToken );
            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            const owner = detail.body.members[0];

            await http().patch( `/projects/${project.id}/members/${owner.id}` ).set( auth( ownerToken ) ).send({ role: 'MEMBER' }).expect( 400 );
            await http().delete( `/projects/${project.id}/members/${owner.id}` ).set( auth( ownerToken ) ).expect( 400 );
        });

        it('⭐ 두 책임자가 동시에 서로를 참여자로 바꾸면 하나만 성공한다 (책임자 행 잠금)', async () => {
            const project = await createProject( ownerToken );
            const second = await addMember( project.id, memberId, { role: 'MANAGER' } );
            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            const owner = detail.body.members.find( ( m: MemberRow ) => m.user.id === ownerId );

            const results = await Promise.all([
                http().patch( `/projects/${project.id}/members/${second.id}` ).set( auth( ownerToken ) ).send({ role: 'MEMBER' }),
                http().patch( `/projects/${project.id}/members/${owner.id}` ).set( auth( memberToken ) ).send({ role: 'MEMBER' }),
            ]);

            expect( results.map( ( r ) => r.status ).sort() ).toEqual([ 200, 400 ]);
            expect( await prisma.projectMember.count({ where: { projectId: project.id, role: 'MANAGER', deleted: false } }) ).toBe( 1 );
        });
    });

    //* 과제·칸반
    describe('과제', () => {
        it('생성 순서대로 컬럼 맨 아래에 붙고, 진척도는 완료 / 전체', async () => {
            const project = await createProject( ownerToken );
            const a = await createTask( project.id, ownerToken );
            const b = await createTask( project.id, ownerToken );
            await createTask( project.id, ownerToken, { status: 'DONE' } );

            expect( await columnOrder( project.id, ProjectTaskStatus.TODO ) ).toEqual([ { id: a.id, sortOrder: 0 }, { id: b.id, sortOrder: 1 } ]);

            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.progress ).toEqual({ done: 1, total: 3, percent: 33 });
        });

        it('참여자가 아닌 회원은 담당자로 지정할 수 없다 (400)', async () => {
            const project = await createProject( ownerToken );
            await http().post( `/projects/${project.id}/tasks` ).set( auth( ownerToken ) ).send({ title: 'x', assigneeId: outsiderId }).expect( 400 );
        });

        it('이동하면 두 컬럼이 0부터 다시 번호 매겨진다', async () => {
            const project = await createProject( ownerToken );
            const t = [];
            for ( let i = 0; i < 3; i++ ) t.push( await createTask( project.id, ownerToken ) );

            await http().patch( `/projects/${project.id}/tasks/${t[0].id}/move` ).set( auth( ownerToken ) ).send({ status: 'IN_PROGRESS', index: 0 }).expect( 200 );
            expect( await columnOrder( project.id, ProjectTaskStatus.TODO ) ).toEqual([ { id: t[1].id, sortOrder: 0 }, { id: t[2].id, sortOrder: 1 } ]);
            expect( await columnOrder( project.id, ProjectTaskStatus.IN_PROGRESS ) ).toEqual([ { id: t[0].id, sortOrder: 0 } ]);

            // 같은 컬럼 안에서 맨 앞으로
            await http().patch( `/projects/${project.id}/tasks/${t[2].id}/move` ).set( auth( ownerToken ) ).send({ status: 'TODO', index: 0 }).expect( 200 );
            expect( ( await columnOrder( project.id, ProjectTaskStatus.TODO ) ).map( ( r ) => r.id ) ).toEqual([ t[2].id, t[1].id ]);
        });

        it('⭐ 같은 컬럼에서 동시에 여러 카드를 옮겨도 번호가 겹치거나 빠지지 않는다 (프로젝트 행 잠금)', async () => {
            const project = await createProject( ownerToken );
            const t = [];
            for ( let i = 0; i < 6; i++ ) t.push( await createTask( project.id, ownerToken ) );

            await Promise.all( t.map( ( task, i ) =>
                http().patch( `/projects/${project.id}/tasks/${task.id}/move` ).set( auth( ownerToken ) ).send({ status: 'TODO', index: ( i * 7 ) % 6 }).expect( 200 ) ) );

            const order = await columnOrder( project.id, ProjectTaskStatus.TODO );
            expect( order.map( ( r ) => r.sortOrder ) ).toEqual([ 0, 1, 2, 3, 4, 5 ]);
            expect( new Set( order.map( ( r ) => r.id ) ).size ).toBe( 6 );
        });

        it('담당 지정 알림, 빠진 참여자의 과제는 담당자가 남고 "부재"로 표시되며 진척도에는 포함된다', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const third = await addMember( project.id, thirdId );
            const task = await createTask( project.id, memberToken, { assigneeId: thirdId } );

            const notice = await prisma.notification.findFirst({ where: { userId: thirdId, actionType: NotificationActionType.PROJECT_TASK_ASSIGNED, targetId: task.id } });
            expect( notice ).not.toBeNull();

            await http().delete( `/projects/${project.id}/members/${third.id}` ).set( auth( ownerToken ) ).expect( 200 );

            const tasks = await http().get( `/projects/${project.id}/tasks` ).set( auth( memberToken ) ).expect( 200 );
            expect( tasks.body[0] ).toMatchObject({ id: task.id, assigneeId: thirdId, assigneeAbsent: true });

            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.progress.total ).toBe( 1 );

            // 부재 담당 교체: 일반 참여자는 403, 책임자는 가능 → 부재 해제
            await http().patch( `/projects/${project.id}/tasks/${task.id}` ).set( auth( memberToken ) ).send({ assigneeId: memberId }).expect( 403 );
            await http().patch( `/projects/${project.id}/tasks/${task.id}` ).set( auth( ownerToken ) ).send({ assigneeId: memberId }).expect( 200 );
            const after = await http().get( `/projects/${project.id}/tasks` ).set( auth( memberToken ) ).expect( 200 );
            expect( after.body[0] ).toMatchObject({ assigneeId: memberId, assigneeAbsent: false });
        });

        it('참여자 누구나 과제를 삭제하고, 삭제된 과제는 진척도에서 빠진다', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const task = await createTask( project.id, ownerToken );
            await createTask( project.id, ownerToken, { status: 'DONE' } );

            await http().delete( `/projects/${project.id}/tasks/${task.id}` ).set( auth( memberToken ) ).expect( 200 );
            const detail = await http().get( `/projects/${project.id}` ).set( auth( ownerToken ) ).expect( 200 );
            expect( detail.body.progress ).toEqual({ done: 1, total: 1, percent: 100 });
        });

        it('내 할 일: 내가 담당인 미완료 과제만', async () => {
            const project = await createProject( ownerToken, { name: '할일 확인용' } );
            await addMember( project.id, memberId );
            const open = await createTask( project.id, ownerToken, { assigneeId: memberId } );
            await createTask( project.id, ownerToken, { assigneeId: memberId, status: 'DONE' } );

            const res = await http().get( '/projects/my-tasks' ).set( auth( memberToken ) ).expect( 200 );
            const mine = res.body.filter( ( t: TaskRow ) => t.project.id === project.id );
            expect( mine.map( ( t: TaskRow ) => t.id ) ).toEqual([ open.id ]);
        });

        it('마감 임박 배치: 내일 마감인 미완료 과제의 담당자에게 (부재 담당자 제외)', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const third = await addMember( project.id, thirdId );
            const tomorrow = addKstDays( kstDateString( new Date() ), 1 );

            const due = await createTask( project.id, ownerToken, { title: '내일 마감', assigneeId: memberId, dueDate: tomorrow } );
            const absentDue = await createTask( project.id, ownerToken, { assigneeId: thirdId, dueDate: tomorrow } );
            await createTask( project.id, ownerToken, { assigneeId: memberId, dueDate: tomorrow, status: 'DONE' } );
            await http().delete( `/projects/${project.id}/members/${third.id}` ).set( auth( ownerToken ) ).expect( 200 );

            await app.get( ProjectTasksService ).notifyDueSoon();

            const notices = await prisma.notification.findMany({ where: { actionType: NotificationActionType.PROJECT_TASK_DUE_SOON, targetId: { in: [ due.id, absentDue.id ] } } });
            expect( notices.map( ( n ) => n.targetId ) ).toEqual([ due.id ]);
            expect( notices[0].userId ).toBe( memberId );
        });
    });
});
