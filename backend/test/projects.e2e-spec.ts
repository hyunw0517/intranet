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

        it('전체 목록(scope=all)은 관리자만, 내 목록은 참여한 것만', async () => {
            const project = await createProject( ownerToken, { name: '목록 확인용' } );
            await http().get( '/projects' ).set( auth( ownerToken ) ).query({ scope: 'all' }).expect( 403 );

            const all = await http().get( '/projects' ).set( auth( adminToken ) ).query({ scope: 'all', search: '목록 확인용' }).expect( 200 );
            expect( all.body.data.map( ( p: { id: number } ) => p.id ) ).toContain( project.id );

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

    //* 협력사 (하청기업)
    describe('협력사', () => {
        const createClient = async ( name: string ) =>
            ( await http().post( '/projects/clients' ).set( auth( ownerToken ) ).send({ name }).expect( 201 ) ).body;

        it('참여자 누구나 추가·수정·빼기, 금액은 문자열(Decimal)로 오고 참여자 전원이 본다', async () => {
            const project = await createProject( ownerToken );
            await addMember( project.id, memberId );
            const client = await createClient( '하청상사A' );

            const created = ( await http().post( `/projects/${project.id}/partners` ).set( auth( memberToken ) ).send({
                clientId: client.id, workScope: '디자인', contractAmount: 12_000_000, startDate: '2026-12-01', endDate: '2026-12-31', contactName: '박담당',
            }).expect( 201 ) ).body;
            expect( created ).toMatchObject({ contractAmount: '12000000', workScope: '디자인', client: { id: client.id, name: '하청상사A' } });

            await http().patch( `/projects/${project.id}/partners/${created.id}` ).set( auth( memberToken ) ).send({ contractAmount: 15_000_000 }).expect( 200 );
            const list = await http().get( `/projects/${project.id}/partners` ).set( auth( memberToken ) ).expect( 200 );
            expect( list.body.map( ( p: { contractAmount: string } ) => p.contractAmount ) ).toEqual([ '15000000' ]);

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
