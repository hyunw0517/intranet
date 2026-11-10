//! 전자결재 e2e (애드온 approvals, docs/design/features.md 7.5)
// 실제 앱(AppModule) + 테스트 DB(intranet_test)로 API를 호출해 확인한다. .env.test의 ADDONS에 approvals를 켜 둔다.
// ⭐ 핵심: 상태 전이(상신 → 순차 승인 / 중간 반려 시 중단), 내 차례만 처리, 동시 처리(같은 결재자 연타, 회수와 승인이 겹침)에도 한 번만 반영된다.

// supertest의 res.body는 any 타입이다. 응답 형태는 각 expect에서 검사하므로 이 파일에서만 any 관련 규칙을 끈다.
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApprovalStatus, ApprovalStepStatus, NotificationActionType, UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('전자결재', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let http: () => ReturnType<typeof request>;

    // 기안자 A, 결재자 B(영업부 팀장)·C(영업부)·D, 외부인 E, 관리자
    const ids = { admin: 0, a: 0, b: 0, c: 0, d: 0, e: 0 };
    const token = { admin: '', a: '', b: '', c: '', d: '', e: '' };
    let salesId: number;    // 영업부
    let devId: number;      // 개발부
    let leaderId: number;   // 직책 팀장

    const auth = ( t: string ) => ({ Authorization: `Bearer ${t}` });

    // 임시저장 → 상신 (기안자 A)
    const draft = ( approverIds: number[], extra: Record<string, unknown> = {} ) =>
        http().post( '/approvals/documents' ).set( auth( token.a ) ).send({
            documentType: 'GENERAL', title: '품의서', content: '<p>내용</p><script>x</script>', steps: approverIds.map( ( approverId ) => ({ approverId }) ), ...extra,
        });
    const submitNew = async ( approverIds: number[] ) => {
        const created = await draft( approverIds ).expect( 201 );
        await http().patch( `/approvals/documents/${created.body.id}/submit` ).set( auth( token.a ) ).expect( 200 );
        return created.body.id as number;
    };
    const approve = ( t: string, id: number, comment?: string ) => http().patch( `/approvals/documents/${id}/approve` ).set( auth( t ) ).send({ comment });
    const box = async ( t: string, name: string ) =>
        ( await http().get( `/approvals/documents?box=${name}&take=100` ).set( auth( t ) ).expect( 200 ) ).body.data.map( ( d: { id: number } ) => d.id );
    const notified = ( userId: number, actionType: NotificationActionType, targetId: number ) =>
        prisma.notification.count({ where: { userId, actionType, targetId } });

    beforeAll( async () => {
        app = await createTestApp();
        http = () => request( app.getHttpServer() );

        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const admin = await createTestUser( prisma, UserRole.ADMIN );
        const users = { a: await createTestUser( prisma ), b: await createTestUser( prisma ), c: await createTestUser( prisma ), d: await createTestUser( prisma ), e: await createTestUser( prisma ) };
        ids.admin = admin.id;
        token.admin = await loginAs( app, admin.empNo );
        for ( const k of [ 'a', 'b', 'c', 'd', 'e' ] as const ) {
            ids[k] = users[k].id;
            token[k] = await loginAs( app, users[k].empNo );
        }

        // 조직: 영업부(B 팀장, C 소속), 개발부(D)
        const meta = { createdId: admin.id, updatedId: admin.id };
        salesId = ( await prisma.department.create({ data: { name: '영업부', ...meta } }) ).id;
        devId = ( await prisma.department.create({ data: { name: '개발부', ...meta } }) ).id;
        leaderId = ( await prisma.jobTitle.create({ data: { name: '팀장', ...meta } }) ).id;
        await prisma.userDepartment.createMany({ data: [
            { userId: ids.b, departmentId: salesId, jobTitleId: leaderId, isPrimary: true, ...meta },
            { userId: ids.c, departmentId: salesId, isPrimary: true, ...meta },
            { userId: ids.d, departmentId: devId, isPrimary: true, ...meta },
        ] });
    });

    afterAll( async () => {
        await app.close();
    });

    it('쓸 수 있는 문서 유형: 결재 본체가 등록한 일반 문서', async () => {
        const res = await http().get( '/approvals/document-types' ).set( auth( token.a ) ).expect( 200 );
        expect( res.body ).toEqual([ { type: 'GENERAL', directCreate: true } ]);
    });

    //! 결재라인 템플릿 + 결재라인 관리자

    describe('결재라인', () => {
        it('개인 결재라인은 본인이 만들고, 남은 볼 수도 고칠 수도 없다(404)', async () => {
            const res = await http().post( '/approvals/lines' ).set( auth( token.a ) )
                .send({ name: '내 라인', scope: 'PERSONAL', steps: [ { approverId: ids.b, name: '검토' }, { approverId: ids.c } ] }).expect( 201 );
            expect( res.body.steps.map( ( s: { approverId: number } ) => s.approverId ) ).toEqual([ ids.b, ids.c ]);

            const mine = await http().get( '/approvals/lines' ).set( auth( token.a ) ).expect( 200 );
            expect( mine.body.map( ( l: { id: number } ) => l.id ) ).toContain( res.body.id );

            const others = await http().get( '/approvals/lines' ).set( auth( token.e ) ).expect( 200 );
            expect( others.body.map( ( l: { id: number } ) => l.id ) ).not.toContain( res.body.id );
            await http().patch( `/approvals/lines/${res.body.id}` ).set( auth( token.e ) ).send({ name: 'x' }).expect( 404 );
            await http().patch( `/approvals/lines/${res.body.id}` ).set( auth( token.admin ) ).send({ name: 'x' }).expect( 404 ); // 관리자도 남의 개인 라인은 못 봄
        });

        it('템플릿 단계 검사: 중복·없는 회원 400', async () => {
            await http().post( '/approvals/lines' ).set( auth( token.a ) )
                .send({ name: '중복', scope: 'PERSONAL', steps: [ { approverId: ids.b }, { approverId: ids.b } ] }).expect( 400 );
            await http().post( '/approvals/lines' ).set( auth( token.a ) )
                .send({ name: '없음', scope: 'PERSONAL', steps: [ { approverId: 99999 } ] }).expect( 400 );
        });

        it('공용 결재라인은 결재라인 관리자만 (일반 회원 403, 관리자 201)', async () => {
            await http().post( '/approvals/lines' ).set( auth( token.a ) )
                .send({ name: '공용', scope: 'ADMIN', steps: [ { approverId: ids.d } ] }).expect( 403 );
            await http().post( '/approvals/lines' ).set( auth( token.admin ) )
                .send({ name: '공용', scope: 'ADMIN', steps: [ { approverId: ids.d } ] }).expect( 201 );
        });

        it('규칙 조합 검사: 대상 둘 다 / 본인 부서 + 회원 대상 400', async () => {
            await http().post( '/approvals/line-managers' ).set( auth( token.admin ) )
                .send({ userId: ids.b, jobTitleId: leaderId, scope: 'ALL' }).expect( 400 );
            await http().post( '/approvals/line-managers' ).set( auth( token.admin ) )
                .send({ userId: ids.b, scope: 'MY_DEPARTMENT' }).expect( 400 );
            await http().post( '/approvals/line-managers' ).set( auth( token.admin ) )
                .send({ userId: ids.b, scope: 'DEPARTMENT' }).expect( 400 ); // 부서 없음
            await http().post( '/approvals/line-managers' ).set( auth( token.b ) )
                .send({ jobTitleId: leaderId, scope: 'MY_DEPARTMENT' }).expect( 403 ); // 등록은 ADMIN만
        });

        it('직책 "팀장 → 본인 부서" 규칙: 영업부 팀장 B는 영업부 결재라인만 관리, 지정·해제가 바로 반영된다', async () => {
            await http().get( '/approvals/lines/manage' ).set( auth( token.b ) ).expect( 403 );

            const rule = await http().post( '/approvals/line-managers' ).set( auth( token.admin ) )
                .send({ jobTitleId: leaderId, scope: 'MY_DEPARTMENT' }).expect( 201 );
            await http().post( '/approvals/line-managers' ).set( auth( token.admin ) )
                .send({ jobTitleId: leaderId, scope: 'MY_DEPARTMENT' }).expect( 409 ); // 같은 규칙

            const me = await http().get( '/approvals/line-managers/me' ).set( auth( token.b ) ).expect( 200 );
            expect( me.body ).toEqual({ all: false, departmentIds: [ salesId ] });

            const line = await http().post( '/approvals/lines' ).set( auth( token.b ) )
                .send({ name: '영업부 기본', scope: 'DEPARTMENT', departmentId: salesId, steps: [ { approverId: ids.d } ] }).expect( 201 );
            await http().post( '/approvals/lines' ).set( auth( token.b ) )
                .send({ name: '개발부', scope: 'DEPARTMENT', departmentId: devId, steps: [ { approverId: ids.d } ] }).expect( 403 );
            await http().post( '/approvals/lines' ).set( auth( token.b ) )
                .send({ name: '공용', scope: 'ADMIN', steps: [ { approverId: ids.d } ] }).expect( 403 );

            // 부서 결재라인은 그 부서 소속(C)만 불러온다
            const c = await http().get( '/approvals/lines' ).set( auth( token.c ) ).expect( 200 );
            expect( c.body.map( ( l: { id: number } ) => l.id ) ).toContain( line.body.id );
            const e = await http().get( '/approvals/lines' ).set( auth( token.e ) ).expect( 200 );
            expect( e.body.map( ( l: { id: number } ) => l.id ) ).not.toContain( line.body.id );

            // 관리 목록: B는 영업부 라인만 (공용 제외)
            const manage = await http().get( '/approvals/lines/manage' ).set( auth( token.b ) ).expect( 200 );
            expect( manage.body.lines.map( ( l: { id: number } ) => l.id ) ).toEqual([ line.body.id ]);

            // 해제하면 바로 관리할 수 없다 (토큰을 다시 받지 않아도)
            await http().delete( `/approvals/line-managers/${rule.body.id}` ).set( auth( token.admin ) ).expect( 200 );
            await http().patch( `/approvals/lines/${line.body.id}` ).set( auth( token.b ) ).send({ name: '변경' }).expect( 403 );
        });

        it('DB CHECK 제약: 범위와 대상 id의 짝이 맞지 않는 행은 저장되지 않는다', async () => {
            await expect( prisma.approvalLineTemplate.create({
                data: { name: '깨진 행', scope: 'PERSONAL', createdId: ids.admin, updatedId: ids.admin }, // 소유자 없음
            }) ).rejects.toThrow();
            await expect( prisma.approvalLineManager.create({
                data: { scope: 'ALL', createdId: ids.admin, updatedId: ids.admin }, // 대상 없음
            }) ).rejects.toThrow();
        });
    });

    //! 임시저장 · 상신

    describe('임시저장과 상신', () => {
        it('결재자 검사: 본인·중복 400, 결재자 없는 임시저장은 허용하지만 상신은 400', async () => {
            await draft([ ids.a ]).expect( 400 );
            await draft([ ids.b, ids.b ]).expect( 400 );

            const empty = await draft([]).expect( 201 );
            expect( empty.body.status ).toBe( ApprovalStatus.DRAFT );
            await http().patch( `/approvals/documents/${empty.body.id}/submit` ).set( auth( token.a ) ).expect( 400 );
        });

        it('본문은 정제되어 저장되고, 임시저장은 기안자만 본다', async () => {
            const res = await draft([ ids.b ]).expect( 201 );
            expect( res.body.content ).toBe( '<p>내용</p>' );
            await http().get( `/approvals/documents/${res.body.id}` ).set( auth( token.b ) ).expect( 404 );
            await http().get( `/approvals/documents/${res.body.id}` ).set( auth( token.admin ) ).expect( 404 );
            expect( await box( token.a, 'drafts' ) ).toContain( res.body.id );
        });

        it('임시저장 수정·삭제는 기안자만, 상신 후에는 수정할 수 없다(409)', async () => {
            const res = await draft([ ids.b ]).expect( 201 );
            const id = res.body.id as number;

            const updated = await http().patch( `/approvals/documents/${id}` ).set( auth( token.a ) )
                .send({ title: '수정됨', steps: [ { approverId: ids.c }, { approverId: ids.b } ] }).expect( 200 );
            expect( updated.body.title ).toBe( '수정됨' );
            expect( updated.body.steps.map( ( s: { approverId: number } ) => s.approverId ) ).toEqual([ ids.c, ids.b ]);

            await http().patch( `/approvals/documents/${id}/submit` ).set( auth( token.a ) ).expect( 200 );
            await http().patch( `/approvals/documents/${id}` ).set( auth( token.a ) ).send({ title: 'x' }).expect( 409 );
            await http().delete( `/approvals/documents/${id}` ).set( auth( token.a ) ).expect( 409 );

            const another = await draft([ ids.b ]).expect( 201 );
            await http().delete( `/approvals/documents/${another.body.id}` ).set( auth( token.a ) ).expect( 200 );
            await http().get( `/approvals/documents/${another.body.id}` ).set( auth( token.a ) ).expect( 404 );
        });

        it('상신: 스냅샷 저장, 1단계 PENDING, 결재 대기함·예정함, 1단계 결재자에게 알림', async () => {
            const id = await submitNew([ ids.b, ids.c, ids.d ]);

            const detail = await http().get( `/approvals/documents/${id}` ).set( auth( token.a ) ).expect( 200 );
            expect( detail.body.status ).toBe( ApprovalStatus.REQUESTED );
            expect( detail.body.steps.map( ( s: { status: string } ) => s.status ) ).toEqual([ 'PENDING', 'WAITING', 'WAITING' ]);
            expect( detail.body.steps[0] ).toMatchObject({ departmentName: '영업부', jobTitleName: '팀장' }); // 결재 당시 소속
            expect( detail.body.histories.map( ( h: { toStatus: string } ) => h.toStatus ) ).toEqual([ 'DRAFT', 'REQUESTED' ]);
            expect( typeof detail.body.histories[0].id ).toBe( 'string' ); // BigInt → 문자열

            expect( await box( token.b, 'pending' ) ).toContain( id );
            expect( await box( token.c, 'upcoming' ) ).toContain( id );
            expect( await box( token.c, 'pending' ) ).not.toContain( id );
            expect( await box( token.a, 'mine' ) ).toContain( id );
            expect( await notified( ids.b, NotificationActionType.APPROVAL_REQUESTED, id ) ).toBe( 1 );
        });
    });

    //! 결재 진행

    describe('결재 진행', () => {
        it('3단계 순서대로 승인 → 최종 승인, 다음 결재자·기안자 알림', async () => {
            const id = await submitNew([ ids.b, ids.c, ids.d ]);

            await approve( token.c, id ).expect( 403 ); // 아직 C 차례가 아님
            await approve( token.b, id, '확인' ).expect( 200 );
            expect( await notified( ids.c, NotificationActionType.APPROVAL_REQUESTED, id ) ).toBe( 1 );

            await approve( token.c, id ).expect( 200 );
            const done = await approve( token.d, id ).expect( 200 );

            expect( done.body.status ).toBe( ApprovalStatus.APPROVED );
            expect( done.body.completedAt ).not.toBeNull();
            expect( done.body.steps.map( ( s: { status: string } ) => s.status ) ).toEqual([ 'APPROVED', 'APPROVED', 'APPROVED' ]);
            expect( done.body.steps[0].comment ).toBe( '확인' );
            expect( done.body.histories.map( ( h: { toStatus: string } ) => h.toStatus ) )
                .toEqual([ 'DRAFT', 'REQUESTED', 'IN_PROGRESS', 'IN_PROGRESS', 'APPROVED' ]);
            expect( await notified( ids.a, NotificationActionType.APPROVAL_APPROVED, id ) ).toBe( 1 );
            expect( await box( token.b, 'processed' ) ).toContain( id );
        });

        it('중간 반려: 의견 필수, 문서 반려 후 다음 단계는 진행하지 않는다', async () => {
            const id = await submitNew([ ids.b, ids.c, ids.d ]);
            await approve( token.b, id ).expect( 200 );

            await http().patch( `/approvals/documents/${id}/reject` ).set( auth( token.c ) ).send({}).expect( 400 );
            const res = await http().patch( `/approvals/documents/${id}/reject` ).set( auth( token.c ) ).send({ comment: '예산 초과' }).expect( 200 );

            expect( res.body.status ).toBe( ApprovalStatus.REJECTED );
            expect( res.body.steps.map( ( s: { status: string } ) => s.status ) ).toEqual([ 'APPROVED', 'REJECTED', 'WAITING' ]);
            await approve( token.d, id ).expect( 409 );
            expect( await box( token.d, 'upcoming' ) ).not.toContain( id );
            expect( await notified( ids.a, NotificationActionType.APPROVAL_REJECTED, id ) ).toBe( 1 );
        });

        it('다시 기안: 반려 문서를 새 임시저장으로 복사하고 원래 문서는 그대로 남는다', async () => {
            const id = await submitNew([ ids.b, ids.c ]);
            await http().patch( `/approvals/documents/${id}/reject` ).set( auth( token.b ) ).send({ comment: '수정 필요' }).expect( 200 );

            await http().post( `/approvals/documents/${id}/copy` ).set( auth( token.b ) ).expect( 403 ); // 기안자만
            const copy = await http().post( `/approvals/documents/${id}/copy` ).set( auth( token.a ) ).expect( 201 );

            expect( copy.body.id ).not.toBe( id );
            expect( copy.body.status ).toBe( ApprovalStatus.DRAFT );
            expect( copy.body.steps.map( ( s: { approverId: number } ) => s.approverId ) ).toEqual([ ids.b, ids.c ]);
            const original = await http().get( `/approvals/documents/${id}` ).set( auth( token.a ) ).expect( 200 );
            expect( original.body.status ).toBe( ApprovalStatus.REJECTED );
        });

        it('회수: 첫 승인 전까지만, 회수하면 결재 대기함에서 빠진다', async () => {
            const id = await submitNew([ ids.b, ids.c ]);
            await http().patch( `/approvals/documents/${id}/cancel` ).set( auth( token.b ) ).expect( 403 ); // 기안자만
            const res = await http().patch( `/approvals/documents/${id}/cancel` ).set( auth( token.a ) ).expect( 200 );
            expect( res.body.status ).toBe( ApprovalStatus.CANCELLED );
            expect( await box( token.b, 'pending' ) ).not.toContain( id );
            await approve( token.b, id ).expect( 409 );

            const started = await submitNew([ ids.b, ids.c ]);
            await approve( token.b, started ).expect( 200 );
            await http().patch( `/approvals/documents/${started}/cancel` ).set( auth( token.a ) ).expect( 409 );
        });

        // ⭐ 같은 결재자가 동시에 여러 번 승인 (두 탭·연타) → 한 번만 반영
        it('⭐ 동시 승인 5건 → 1건만 성공, 나머지 409, 단계가 한 번만 넘어간다', async () => {
            const id = await submitNew([ ids.b, ids.c, ids.d ]);

            const results = await Promise.all( Array.from( { length: 5 }, () => approve( token.b, id ) ) );
            const codes = results.map( ( r ) => r.status ).sort();
            expect( codes ).toEqual([ 200, 409, 409, 409, 409 ]);

            const doc = await prisma.approvalDocument.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { stepOrder: 'asc' } } } });
            expect( doc.status ).toBe( ApprovalStatus.IN_PROGRESS );
            expect( doc.currentStepOrder ).toBe( 2 );
            expect( doc.steps.map( ( s ) => s.status ) ).toEqual([ ApprovalStepStatus.APPROVED, ApprovalStepStatus.PENDING, ApprovalStepStatus.WAITING ]);
            expect( await prisma.approvalDocumentHistory.count({ where: { approvalDocumentId: id } }) ).toBe( 3 ); // DRAFT, REQUESTED, IN_PROGRESS
        });

        // ⭐ 기안자의 회수와 1단계 결재자의 승인이 동시에 → 한쪽만 성공, 상태가 섞이지 않는다 (교착 없음, 500 없음)
        it('⭐ 회수와 승인이 동시에 → 한쪽만 성공', async () => {
            for ( let i = 0; i < 5; i++ ) {
                const id = await submitNew([ ids.b, ids.c ]);
                const [ cancel, approved ] = await Promise.all([
                    http().patch( `/approvals/documents/${id}/cancel` ).set( auth( token.a ) ),
                    approve( token.b, id ),
                ]);

                expect( [ cancel.status, approved.status ].sort() ).toEqual([ 200, 409 ]);

                const doc = await prisma.approvalDocument.findUniqueOrThrow({ where: { id }, include: { steps: { orderBy: { stepOrder: 'asc' } } } });
                if ( cancel.status === 200 ) {
                    expect( doc.status ).toBe( ApprovalStatus.CANCELLED );
                    expect( doc.steps.map( ( s ) => s.status ) ).toEqual([ ApprovalStepStatus.WAITING, ApprovalStepStatus.WAITING ]);
                } else {
                    expect( doc.status ).toBe( ApprovalStatus.IN_PROGRESS );
                    expect( doc.steps.map( ( s ) => s.status ) ).toEqual([ ApprovalStepStatus.APPROVED, ApprovalStepStatus.PENDING ]);
                }
            }
        });

        it('DB 부분 unique 인덱스: 한 문서에 PENDING 단계는 둘일 수 없다', async () => {
            const id = await submitNew([ ids.b, ids.c ]);
            await expect( prisma.approvalDocumentStep.updateMany({
                where: { approvalDocumentId: id, stepOrder: 2 },
                data: { status: ApprovalStepStatus.PENDING },
            }) ).rejects.toThrow();
        });
    });

    //! 열람 · 관리자

    describe('열람과 관리자 결재자 교체', () => {
        it('열람: 결재라인 밖의 회원 404, 관리자는 조회 가능하지만 처리는 못 한다, 전체 문서함은 관리자만', async () => {
            const id = await submitNew([ ids.b ]);
            await http().get( `/approvals/documents/${id}` ).set( auth( token.e ) ).expect( 404 );

            const admin = await http().get( `/approvals/documents/${id}` ).set( auth( token.admin ) ).expect( 200 );
            expect( admin.body.permissions ).toMatchObject({ canApprove: false, canReplaceApprover: true });
            await approve( token.admin, id ).expect( 403 );

            expect( await box( token.admin, 'all' ) ).toContain( id );
            await http().get( '/approvals/documents?box=all' ).set( auth( token.a ) ).expect( 403 );
        });

        it('퇴사한 결재자 → 상세에 표시, 관리자가 교체하면 새 결재자에게 알림이 가고 처리할 수 있다', async () => {
            const id = await submitNew([ ids.b, ids.c ]);
            await approve( token.b, id ).expect( 200 );
            await prisma.users.update({ where: { id: ids.c }, data: { status: UserStatus.RESIGNED } });

            try {
                const detail = await http().get( `/approvals/documents/${id}` ).set( auth( token.a ) ).expect( 200 );
                expect( detail.body.steps[1].approverUsable ).toBe( false );

                await http().patch( `/approvals/documents/${id}/steps/2` ).set( auth( token.a ) ).send({ approverId: ids.e }).expect( 403 ); // ADMIN만
                await http().patch( `/approvals/documents/${id}/steps/1` ).set( auth( token.admin ) ).send({ approverId: ids.e }).expect( 409 ); // 처리된 단계
                await http().patch( `/approvals/documents/${id}/steps/2` ).set( auth( token.admin ) ).send({ approverId: ids.a }).expect( 400 ); // 기안자

                const replaced = await http().patch( `/approvals/documents/${id}/steps/2` ).set( auth( token.admin ) ).send({ approverId: ids.e }).expect( 200 );
                expect( replaced.body.steps[1] ).toMatchObject({ approverId: ids.e, status: 'PENDING', approverUsable: true });
                expect( await notified( ids.e, NotificationActionType.APPROVAL_REQUESTED, id ) ).toBe( 1 );

                const done = await approve( token.e, id ).expect( 200 );
                expect( done.body.status ).toBe( ApprovalStatus.APPROVED );
            } finally {
                await prisma.users.update({ where: { id: ids.c }, data: { status: UserStatus.ACTIVE } });
            }
        });

        it('첨부: 상신 후 결재자는 내려받고, 라인 밖의 회원은 404', async () => {
            const upload = await http().post( '/common/files/attachments' ).set( auth( token.a ) )
                .attach( 'file', Buffer.from( '결재 첨부' ), 'memo.txt' ).expect( 201 );

            const created = await draft( [ ids.b ], { attachmentIds: [ upload.body.id ] } ).expect( 201 );
            expect( created.body.files.map( ( f: { id: number } ) => f.id ) ).toEqual([ upload.body.id ]);
            await http().patch( `/approvals/documents/${created.body.id}/submit` ).set( auth( token.a ) ).expect( 200 );

            const file = await http().get( `/approvals/documents/${created.body.id}/files/${upload.body.id}` ).set( auth( token.b ) ).expect( 200 );
            expect( file.headers['content-disposition'] ).toContain( 'memo.txt' );
            await http().get( `/approvals/documents/${created.body.id}/files/${upload.body.id}` ).set( auth( token.e ) ).expect( 404 );

            // 반려 → 다시 기안: 첨부는 새 파일로 복사된다 (원래 문서의 첨부는 그대로)
            await http().patch( `/approvals/documents/${created.body.id}/reject` ).set( auth( token.b ) ).send({ comment: '보완' }).expect( 200 );
            const copy = await http().post( `/approvals/documents/${created.body.id}/copy` ).set( auth( token.a ) ).expect( 201 );
            expect( copy.body.files ).toHaveLength( 1 );
            expect( copy.body.files[0].id ).not.toBe( upload.body.id );
            expect( copy.body.files[0].originalName ).toBe( 'memo.txt' );

            const copied = await http().get( `/approvals/documents/${copy.body.id}/files/${copy.body.files[0].id}` ).set( auth( token.a ) ).buffer( true ).expect( 200 );
            expect( Buffer.from( copied.body as Buffer ).toString() ).toBe( '결재 첨부' );
            await http().get( `/approvals/documents/${created.body.id}/files/${upload.body.id}` ).set( auth( token.a ) ).expect( 200 );
        });
    });
});
