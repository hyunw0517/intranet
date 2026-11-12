//! 휴가 e2e (결재의 옵션 leaves, docs/design/features.md 7.4 · leave_calculate_manual.md)
// 결재는 .env.test의 ADDONS로 켜져 있고, 휴가 모듈은 이 파일에서 직접 붙인다(createTestApp([ LeavesModule ])).
//   addonModule()의 조건은 AppModule을 import하는 순간 .env.test 값으로 정해져서, beforeAll에서 process.env.ADDONS를 바꿔도 늦다.
//   .env.test의 ADDONS에 leaves를 넣어도 같은 모듈 클래스라 한 번만 등록된다.
// ⭐ 핵심: 상신·최종 승인 때 하루 합계 1일 + 연차 잔여(진행 중 포함)를 결재와 같은 트랜잭션에서 검사하고,
//    같은 회원이 동시에 두 건을 상신해도 회원 행 잠금으로 한 건만 통과한다.

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApprovalStatus, UserRole } from 'src/generated/prisma/client';
import { LeaveGrantsService } from 'src/approvals/leaves/leave-grants.service';
import { LeavesModule } from 'src/approvals/leaves/leaves.module';
import { kstDateString } from 'src/common/util/date.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('휴가', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let http: () => ReturnType<typeof request>;

    // 신청자 A·C·D, 결재자 B, 외부인 E, 관리자
    const ids = { admin: 0, a: 0, b: 0, c: 0, d: 0, e: 0 };
    const token = { admin: '', a: '', b: '', c: '', d: '', e: '' };

    // 지난 날짜도 신청할 수 있으므로 올해 날짜를 고정해서 쓴다 (올해 부여 행으로 잔여를 검사)
    const year = Number( kstDateString( new Date() ).slice( 0, 4 ) );
    const day = ( mmdd: string ) => `${year}-${mmdd}`;

    const auth = ( t: string ) => ({ Authorization: `Bearer ${t}` });

    const createLeave = ( t: string, body: Record<string, unknown> ) =>
        http().post( '/approvals/leaves' ).set( auth( t ) ).send({ steps: [ { approverIds: [ ids.b ] } ], ...body });
    const submit = ( t: string, documentId: number ) => http().patch( `/approvals/documents/${documentId}/submit` ).set( auth( t ) );
    const approve = ( documentId: number ) => http().patch( `/approvals/documents/${documentId}/approve` ).set( auth( token.b ) ).send({});
    const summary = async ( t: string ) => ( await http().get( '/approvals/leaves/me' ).set( auth( t ) ).expect( 200 ) ).body;
    const adjust = ( userId: number, adjustDays: number ) =>
        http().patch( `/approvals/leaves/grants/${userId}` ).set( auth( token.admin ) ).send({ adjustDays, adjustReason: '테스트' });

    // 임시저장 → 상신까지 성공시키고 문서 id
    const submitted = async ( t: string, body: Record<string, unknown> ) => {
        const created = await createLeave( t, body ).expect( 201 );
        await submit( t, created.body.documentId ).expect( 200 );
        return created.body.documentId as number;
    };

    beforeAll( async () => {
        app = await createTestApp([ LeavesModule ]);
        http = () => request( app.getHttpServer() );

        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const admin = await createTestUser( prisma, UserRole.ADMIN );
        ids.admin = admin.id;
        token.admin = await loginAs( app, admin.empNo );
        for ( const k of [ 'a', 'b', 'c', 'd', 'e' ] as const ) {
            const user = await createTestUser( prisma );
            ids[k] = user.id;
            token[k] = await loginAs( app, user.empNo );
        }

        // 2000-01-01 입사 → 올해 25일(한도). 날짜와 무관하게 결과가 같다.
        await prisma.users.updateMany({ data: { joinAt: new Date( '2000-01-01T00:00:00Z' ) } });
    });

    afterAll( async () => {
        await app.close();
    });

    it('휴가 문서 유형은 결재 문서 API로 만들 수 없다 (휴가 API로만)', async () => {
        const types = await http().get( '/approvals/document-types' ).set( auth( token.a ) ).expect( 200 );
        expect( types.body ).toContainEqual({ type: 'LEAVE', directCreate: false });

        await http().post( '/approvals/documents' ).set( auth( token.a ) ).send({ documentType: 'LEAVE', title: '휴가' }).expect( 400 );
    });

    describe('연차 부여 (관리자)', () => {
        it('관리자만 재계산·조회할 수 있다', async () => {
            await http().post( '/approvals/leaves/grants/recalculate' ).set( auth( token.a ) ).expect( 403 );
            await http().get( '/approvals/leaves/grants' ).set( auth( token.a ) ).expect( 403 );
        });

        it('재계산 → 올해 행 생성, 조정값은 재계산해도 유지된다', async () => {
            const res = await http().post( '/approvals/leaves/grants/recalculate' ).set( auth( token.admin ) ).expect( 201 );
            expect( res.body ).toMatchObject({ year, count: 6 });
            expect( await summary( token.a ) ).toMatchObject({ hasGrant: true, baseDays: 25, adjustDays: 0, grantedDays: 25, remainingDays: 25 });

            await adjust( ids.a, -10 ).expect( 200 );
            await http().post( '/approvals/leaves/grants/recalculate' ).set( auth( token.admin ) ).expect( 201 );
            expect( await summary( token.a ) ).toMatchObject({ baseDays: 25, adjustDays: -10, grantedDays: 15 });

            const list = await http().get( `/approvals/leaves/grants?year=${year}&search=${encodeURIComponent( '테스트' )}` ).set( auth( token.admin ) ).expect( 200 );
            expect( list.body.meta.total ).toBe( 6 );
        });

        it('조정: 0.25 단위만, 부여 합계는 0 이상', async () => {
            await adjust( ids.a, 0.3 ).expect( 400 );
            await adjust( ids.a, -25.25 ).expect( 400 );
            await adjust( ids.a, -10 ).expect( 200 );
        });

        it('12월 재계산은 다음 해 행도 만든다 → 다음 해 조정·연차 신청 가능, 지난 연도는 조정 불가', async () => {
            const next = year + 1;
            // 다음 해 행이 없을 때: 조정 404, 다음 해 연차 상신은 부여 0으로 거부
            await http().patch( `/approvals/leaves/grants/${ids.e}` ).set( auth( token.admin ) ).send({ year: next, adjustDays: 1, adjustReason: '이월' }).expect( 404 );

            // 기준일을 API로 바꿀 수 없어 서비스를 직접 부른다 (12/1 월 배치와 같음)
            const result = await app.get( LeaveGrantsService ).recalculate( null, `${year}-12-01` );
            expect( result.years ).toEqual([ { year, count: 6 }, { year: next, count: 6 } ]);

            await http().patch( `/approvals/leaves/grants/${ids.e}` ).set( auth( token.admin ) ).send({ year: next, adjustDays: 2, adjustReason: '이월' }).expect( 200 );
            const summaryNext = await http().get( `/approvals/leaves/me?year=${next}` ).set( auth( token.e ) ).expect( 200 );
            expect( summaryNext.body ).toMatchObject({ year: next, baseDays: 25, adjustDays: 2, grantedDays: 27 });

            const created = await createLeave( token.e, { type: 'ANNUAL', unit: 'FULL', startDate: `${next}-01-05`, endDate: `${next}-01-06` } ).expect( 201 );
            await submit( token.e, created.body.documentId ).expect( 200 );

            await http().patch( `/approvals/leaves/grants/${ids.e}` ).set( auth( token.admin ) ).send({ year: year - 1, adjustDays: 1, adjustReason: '과거' }).expect( 400 );
        });
    });

    describe('신청 (임시저장)', () => {
        it('종일은 달력 일수, 제목은 서버가 만든다', async () => {
            const res = await createLeave( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '03-06' ), endDate: day( '03-09' ), reason: '가족 여행' } ).expect( 201 );
            expect( res.body ).toMatchObject({ days: 4, startTime: null, documentStatus: ApprovalStatus.DRAFT, reason: '가족 여행' });

            const doc = await http().get( `/approvals/documents/${res.body.documentId}` ).set( auth( token.a ) ).expect( 200 );
            expect( doc.body.title ).toBe( `[연차] ${day( '03-06' )} ~ ${day( '03-09' )} (4일)` );
        });

        it('수정: 반차로 바꾸면 종료일·시각을 다시 계산하고 제목도 바뀐다', async () => {
            const created = await createLeave( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '03-10' ), endDate: day( '03-11' ) } ).expect( 201 );
            const id = created.body.documentId;

            const res = await http().patch( `/approvals/leaves/documents/${id}` ).set( auth( token.a ) ).send({ unit: 'HALF', startTime: '14:00' }).expect( 200 );
            expect( res.body ).toMatchObject({ unit: 'HALF', startDate: day( '03-10' ), endDate: day( '03-10' ), startTime: '14:00', endTime: '18:00', days: 0.5 });

            const doc = await http().get( `/approvals/documents/${id}` ).set( auth( token.a ) ).expect( 200 );
            expect( doc.body.title ).toBe( `[연차] ${day( '03-10' )} 반차 14:00~18:00 (0.5일)` );

            // 휴가 문서는 결재 문서 수정 API로 고칠 수 없다 (제목을 마음대로 바꾸지 못하게)
            await http().patch( `/approvals/documents/${id}` ).set( auth( token.a ) ).send({ title: '다른 제목' }).expect( 400 );
            // 남의 휴가 문서는 404
            await http().patch( `/approvals/leaves/documents/${id}` ).set( auth( token.e ) ).send({ unit: 'FULL' }).expect( 404 );
        });

        it('입력 검사: 연도를 걸치는 기간, 30분 단위가 아닌 시각', async () => {
            await createLeave( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '12-31' ), endDate: `${year + 1}-01-01` } ).expect( 400 );
            await createLeave( token.a, { type: 'ANNUAL', unit: 'QUARTER', startDate: day( '03-12' ), startTime: '09:15' } ).expect( 400 );
        });
    });

    describe('상신·승인과 잔여 연차', () => {
        it('승인되면 사용, 결재 중이면 진행 중으로 잡힌다. 휴가 정보는 결재자도 보고 외부인은 404', async () => {
            const id = await submitted( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '04-01' ), endDate: day( '04-03' ) } );
            expect( await summary( token.a ) ).toMatchObject({ grantedDays: 15, usedDays: 0, inProgressDays: 3, remainingDays: 12 });

            await http().get( `/approvals/leaves/documents/${id}` ).set( auth( token.b ) ).expect( 200 );
            await http().get( `/approvals/leaves/documents/${id}` ).set( auth( token.e ) ).expect( 404 );

            await approve( id ).expect( 200 );
            expect( await summary( token.a ) ).toMatchObject({ usedDays: 3, inProgressDays: 0, remainingDays: 12 });
        });

        it('잔여보다 많으면 상신 거부 (진행 중 포함), 병가는 잔여와 무관', async () => {
            await submitted( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '05-01' ), endDate: day( '05-10' ) } ); // 진행 중 10 → 잔여 2

            const over = await createLeave( token.a, { type: 'ANNUAL', unit: 'FULL', startDate: day( '05-20' ), endDate: day( '05-22' ) } ).expect( 201 );
            const res = await submit( token.a, over.body.documentId ).expect( 400 );
            expect( res.body.message ).toMatch( /연차가 부족/ );
            // 거부되면 상신 전체가 롤백되어 임시저장으로 남는다
            const doc = await http().get( `/approvals/documents/${over.body.documentId}` ).set( auth( token.a ) ).expect( 200 );
            expect( doc.body.status ).toBe( ApprovalStatus.DRAFT );

            await submitted( token.a, { type: 'SICK', unit: 'FULL', startDate: day( '05-20' ), endDate: day( '05-22' ) } );
        });

        it('하루 합계 1일: 같은 날 반차 두 건은 되고, 종일과 겹치면 거부 (유형 무관)', async () => {
            await submitted( token.c, { type: 'ANNUAL', unit: 'HALF', startDate: day( '06-01' ), startTime: '09:00' } );
            await submitted( token.c, { type: 'ANNUAL', unit: 'HALF', startDate: day( '06-01' ), startTime: '14:00' } );

            // 시간은 안 겹치지만(18:00~20:00) 하루 합계가 1.25일
            const third = await createLeave( token.c, { type: 'SICK', unit: 'QUARTER', startDate: day( '06-01' ), startTime: '18:00' } ).expect( 201 );
            const res = await submit( token.c, third.body.documentId ).expect( 400 );
            expect( res.body.message ).toMatch( new RegExp( `${day( '06-01' )}.*하루 1일` ) );

            const full = await createLeave( token.c, { type: 'OFFICIAL', unit: 'FULL', startDate: day( '05-31' ), endDate: day( '06-02' ) } ).expect( 201 );
            const fullRes = await submit( token.c, full.body.documentId ).expect( 400 );
            expect( fullRes.body.message ).toMatch( /시간이 겹칩니다/ );
        });

        it('시간 겹침: 결재 중·승인된 휴가와 시간이 겹치면 상신 거부, 끝나는 시각부터는 가능', async () => {
            const approvedId = await submitted( token.c, { type: 'ANNUAL', unit: 'HALF', startDate: day( '06-10' ), startTime: '09:00' } ); // 09:00~13:00
            await approve( approvedId ).expect( 200 );

            const overlap = await createLeave( token.c, { type: 'SICK', unit: 'QUARTER', startDate: day( '06-10' ), startTime: '12:00' } ).expect( 201 );
            const res = await submit( token.c, overlap.body.documentId ).expect( 400 );
            expect( res.body.message ).toBe( `이미 신청한 휴가(연차 ${day( '06-10' )} 09:00~13:00)와 ${day( '06-10' )}에 시간이 겹칩니다.` );

            await submitted( token.c, { type: 'SICK', unit: 'QUARTER', startDate: day( '06-10' ), startTime: '13:00' } );
        });

        it('캘린더: 전 직원이 보고, 승인된 휴가만 날짜별로, 유형은 내보내지 않는다', async () => {
            // C에게 대표 소속·직급을 준다
            const meta = { createdId: ids.admin, updatedId: ids.admin };
            const dept = await prisma.department.create({ data: { name: '인사팀', ...meta } });
            const position = await prisma.position.create({ data: { name: '대리', ...meta } });
            await prisma.userDepartment.create({ data: { userId: ids.c, departmentId: dept.id, isPrimary: true, ...meta } });
            await prisma.users.update({ where: { id: ids.c }, data: { positionId: position.id } });

            const range = ( from: string, to: string ) => `start=${encodeURIComponent( `${from}T00:00:00+09:00` )}&end=${encodeURIComponent( `${to}T00:00:00+09:00` )}`;

            // 6월: C의 06-10 09:00 반차(승인)만. 06-01 반차 두 건·06-10 13:00 반반차는 결재 중이라 빠진다. 외부인 E도 볼 수 있다.
            const june = await http().get( `/approvals/leaves/calendar?${range( day( '06-01' ), day( '07-01' ) )}` ).set( auth( token.e ) ).expect( 200 );
            expect( june.body ).toEqual([
                {
                    date: day( '06-10' ), count: 1,
                    people: [ expect.objectContaining({ userId: ids.c, departmentName: '인사팀', positionName: '대리', unit: 'HALF', startTime: '09:00', endTime: '13:00' }) ],
                },
            ]);
            expect( june.body[0].people[0] ).not.toHaveProperty( 'type' );

            // 4월: A의 04-01~04-03 종일(승인)이 날마다 들어간다
            const april = await http().get( `/approvals/leaves/calendar?${range( day( '04-01' ), day( '05-01' ) )}` ).set( auth( token.e ) ).expect( 200 );
            expect( april.body.map( ( d: { date: string } ) => d.date ) ).toEqual([ day( '04-01' ), day( '04-02' ), day( '04-03' ) ]);
            expect( april.body[0].people[0] ).toMatchObject({ userId: ids.a, unit: 'FULL', startTime: null, departmentName: null, positionName: null });

            // 기간이 너무 길면 400
            await http().get( `/approvals/leaves/calendar?${range( day( '01-01' ), day( '04-01' ) )}` ).set( auth( token.e ) ).expect( 400 );
        });

        it('캘린더 게시판 "휴가자 표시" 옵션: 캘린더만 켤 수 있고, 타입을 바꾸면 꺼지며, 일정 조회 응답에 실린다', async () => {
            const admin = auth( token.admin );
            const created = await http().post( '/boards' ).set( admin ).send({ type: 'CALENDAR', name: '전사 일정', showLeaves: true }).expect( 201 );
            expect( created.body.showLeaves ).toBe( true );
            const other = await http().post( '/boards' ).set( admin ).send({ type: 'CALENDAR', name: '팀 일정' }).expect( 201 );
            expect( other.body.showLeaves ).toBe( false );

            // 캘린더가 아니면 켤 수 없다
            await http().post( '/boards' ).set( admin ).send({ type: 'NORMAL', name: '공지', showLeaves: true }).expect( 400 );

            // 게시판 정보·일정 조회에 실린다 (규칙이 없는 게시판은 관리자만 본다)
            const board = await http().get( `/boards/${created.body.id}` ).set( admin ).expect( 200 );
            expect( board.body.board.showLeaves ).toBe( true );
            const range = `start=${encodeURIComponent( `${day( '06-01' )}T00:00:00+09:00` )}&end=${encodeURIComponent( `${day( '07-01' )}T00:00:00+09:00` )}`;
            const single = await http().get( `/boards/${other.body.id}/events?${range}` ).set( admin ).expect( 200 );
            expect( single.body.showLeaves ).toBe( false );
            // 통합: 보고 있는 게시판 중 하나라도 켜져 있으면 true
            const all = await http().get( `/boards/events?${range}` ).set( admin ).expect( 200 );
            expect( all.body.showLeaves ).toBe( true );
            expect( all.body.boards ).toEqual( expect.arrayContaining([ { id: created.body.id, name: '전사 일정', showLeaves: true } ]) );

            // 캘린더가 아닌 타입으로 바꾸면 자동으로 꺼진다
            const changed = await http().patch( `/boards/${created.body.id}` ).set( admin ).send({ name: '전사 일정', type: 'NORMAL' }).expect( 200 );
            expect( changed.body.showLeaves ).toBe( false );
        });

        it('⭐ 같은 회원이 동시에 두 건을 상신하면 잔여만큼만 통과한다', async () => {
            // D: 부여 3일. 2일짜리 두 건을 동시에 상신 → 한 건만 200
            await adjust( ids.d, -22 ).expect( 200 );
            const first = await createLeave( token.d, { type: 'ANNUAL', unit: 'FULL', startDate: day( '07-01' ), endDate: day( '07-02' ) } ).expect( 201 );
            const second = await createLeave( token.d, { type: 'ANNUAL', unit: 'FULL', startDate: day( '07-06' ), endDate: day( '07-07' ) } ).expect( 201 );

            const results = await Promise.all([ submit( token.d, first.body.documentId ), submit( token.d, second.body.documentId ) ]);
            expect( results.map( ( r ) => r.status ).sort() ).toEqual([ 200, 400 ]);
            expect( await summary( token.d ) ).toMatchObject({ inProgressDays: 2, remainingDays: 1 });
        });

        it('최종 승인 때 다시 검사: 그사이 부여가 줄었으면 승인 전체가 롤백된다', async () => {
            // D: 진행 중 2일(위 테스트). 부여를 1일로 줄이면 승인할 수 없다 (잔여 음수는 허용)
            const pending = await prisma.leaveRequest.findFirstOrThrow({
                where: { userId: ids.d, approvalDocument: { status: ApprovalStatus.REQUESTED } },
            });
            await adjust( ids.d, -24 ).expect( 200 );
            expect( await summary( token.d ) ).toMatchObject({ grantedDays: 1, remainingDays: -1 });

            await approve( pending.approvalDocumentId ).expect( 400 );
            const doc = await prisma.approvalDocument.findUniqueOrThrow({ where: { id: pending.approvalDocumentId } });
            expect( doc.status ).toBe( ApprovalStatus.REQUESTED );
            const step = await prisma.approvalDocumentStep.findFirstOrThrow({ where: { approvalDocumentId: doc.id } });
            expect( step.status ).toBe( 'PENDING' );

            await adjust( ids.d, -22 ).expect( 200 );
            await approve( pending.approvalDocumentId ).expect( 200 );
        });

        it('반려된 휴가는 다시 기안하면 휴가 항목까지 복사된다', async () => {
            const id = await submitted( token.c, { type: 'ANNUAL', unit: 'QUARTER', startDate: day( '08-03' ), startTime: '10:00', reason: '병원' } );
            await http().patch( `/approvals/documents/${id}/reject` ).set( auth( token.b ) ).send({ comment: '일정 조정' }).expect( 200 );

            const copied = await http().post( `/approvals/documents/${id}/copy` ).set( auth( token.c ) ).expect( 201 );
            const leave = await http().get( `/approvals/leaves/documents/${copied.body.id}` ).set( auth( token.c ) ).expect( 200 );
            expect( leave.body ).toMatchObject({
                documentStatus: ApprovalStatus.DRAFT, unit: 'QUARTER', startDate: day( '08-03' ), startTime: '10:00', endTime: '12:00', days: 0.25, reason: '병원',
            });

            // 내 목록: 반려된 원본과 새 임시저장 둘 다
            const mine = await http().get( `/approvals/leaves?year=${year}` ).set( auth( token.c ) ).expect( 200 );
            expect( mine.body.map( ( l: { documentId: number } ) => l.documentId ) ).toEqual( expect.arrayContaining([ id, copied.body.id ]) );
        });
    });
});
