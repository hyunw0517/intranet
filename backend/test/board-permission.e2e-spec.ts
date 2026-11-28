//! 게시판 권한 e2e (features.md)
// - BoardAuth 규칙이 없는 게시판은 게시판 관리 기능을 가진 관리자만 본다 (기본 거부)
// - 읽기 권한이 없으면 404 (게시판이 있는지도 알려 주지 않는다), 읽을 수는 있지만 그 동작 권한이 없으면 403
// - 하위 리소스(글·댓글)는 URL의 게시판 권한을 먼저 보고, 그 글이 정말 그 게시판의 글인지 확인한다 (PostsService.checkPost)
// - 비밀글: 작성자와 게시판 관리 권한(authAdmin)만. 수정은 작성자만, 삭제는 작성자 또는 게시판 관리 권한
// 규칙 판정 함수 자체(부서·하위 부서·직급·직책 조합)는 단위 테스트(board-permission.util.spec.ts)가 따로 본다.
// 여기서는 실제 API를 거쳤을 때 위 규칙이 지켜지는지를 본다.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('게시판 권한', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    // 관리자(게시판 관리 기능), 개발팀 회원 2명, 개발팀 팀장(게시판 관리 권한), 다른 부서 회원
    const token = { admin: '', member: '', member2: '', leader: '', outsider: '' };
    const board = { closed: 0, team: 0, open: 0 };
    const post = { open: 0, team: 0, teamKept: 0, secret: 0 };

    const http = () => request( app.getHttpServer() );
    const auth = ( t: string ) => ({ Authorization: `Bearer ${t}` });
    const posts = ( boardId: number ) => `/boards/${boardId}/posts`;

    beforeAll( async () => {
        app = await createTestApp();
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const admin = await createTestUser( prisma, UserRole.ADMIN );
        const member = await createTestUser( prisma, UserRole.USER );
        const member2 = await createTestUser( prisma, UserRole.USER );
        const leader = await createTestUser( prisma, UserRole.USER );
        const outsider = await createTestUser( prisma, UserRole.USER );
        const actor = { createdId: admin.id, updatedId: admin.id };

        // 조직: 개발팀(member·member2·leader, leader는 팀장 직책) / 영업팀(outsider)
        const dev = await prisma.department.create({ data: { name: '개발팀', sortOrder: 0, ...actor } });
        const sales = await prisma.department.create({ data: { name: '영업팀', sortOrder: 1, ...actor } });
        const teamLeader = await prisma.jobTitle.create({ data: { name: '팀장', sortOrder: 0, ...actor } });

        const link = ( userId: number, departmentId: number, jobTitleId: number | null = null ) =>
            prisma.userDepartment.create({ data: { userId, departmentId, jobTitleId, isPrimary: true, ...actor } });
        await link( member.id, dev.id );
        await link( member2.id, dev.id );
        await link( leader.id, dev.id, teamLeader.id );
        await link( outsider.id, sales.id );

        token.admin = await loginAs( app, admin.empNo );
        token.member = await loginAs( app, member.empNo );
        token.member2 = await loginAs( app, member2.empNo );
        token.leader = await loginAs( app, leader.empNo );
        token.outsider = await loginAs( app, outsider.empNo );

        // 게시판은 관리자 API로 만든다
        const createBoard = async ( name: string, allowSecret = false ) =>
            ( ( await http().post( '/boards' ).set( auth( token.admin ) ).send({ type: 'NORMAL', name, isAnonymous: false, allowSecret }).expect( 201 ) ).body as { id: number } ).id;
        const addRule = ( boardId: number, rule: Record<string, unknown> ) =>
            http().post( `/boards/${boardId}/auths` ).set( auth( token.admin ) ).send( rule ).expect( 201 );

        // ① 규칙 없음 → 관리자만
        board.closed = await createBoard( '관리자 전용' );

        // ② 개발팀 게시판: 개발팀은 읽기·쓰기·댓글, 개발팀 팀장은 게시판 관리 권한도 (규칙이 여러 개면 권한별 합집합)
        board.team = await createBoard( '개발팀', true );
        await addRule( board.team, { departmentId: dev.id, authRead: true, authWrite: true, authComment: true } );
        await addRule( board.team, { departmentId: dev.id, jobTitleIds: [ teamLeader.id ], authAdmin: true } );

        // ③ 사내 소식: 조건이 빈 규칙 = 전체 허용. 읽기만 (쓰기·댓글 불가)
        board.open = await createBoard( '사내 소식' );
        await addRule( board.open, { authRead: true, authWrite: false, authComment: false } );

        const write = async ( t: string, boardId: number, body: Record<string, unknown> ) =>
            ( ( await http().post( posts( boardId ) ).set( auth( t ) ).send({ content: '<p>내용</p>', ...body }).expect( 201 ) ).body as { id: number } ).id;
        post.open = await write( token.admin, board.open, { title: '공지' } );
        post.team = await write( token.member, board.team, { title: '개발팀 글' } );       // 수정·삭제 테스트에서 지운다
        post.teamKept = await write( token.member, board.team, { title: '개발팀 공개 글' } ); // URL 조작 테스트용 (비밀글이 아님)
        post.secret = await write( token.member, board.team, { title: '비밀글', isSecret: true } );
    }, 30000 ); // 준비 요청이 많아 전체 e2e를 함께 돌리면 기본 5초를 넘길 수 있다

    afterAll( async () => {
        await app.close();
    });

    describe('기본 거부 · 읽기 권한', () => {
        it('규칙이 없는 게시판은 관리자만 본다', async () => {
            await http().get( posts( board.closed ) ).set( auth( token.member ) ).expect( 404 );
            await http().get( posts( board.closed ) ).set( auth( token.admin ) ).expect( 200 );
        });

        it('메뉴(navigation)에는 읽을 수 있는 게시판만 나온다', async () => {
            const idsOf = async ( t: string ) =>
                ( ( await http().get( '/boards/navigation' ).set( auth( t ) ).expect( 200 ) ).body as { id: number }[] ).map( ( b ) => b.id );

            const memberIds = await idsOf( token.member );
            expect( memberIds ).toEqual( expect.arrayContaining( [ board.team, board.open ] ) );
            expect( memberIds ).not.toContain( board.closed );

            const outsiderIds = await idsOf( token.outsider );
            expect( outsiderIds ).toContain( board.open );
            expect( outsiderIds ).not.toContain( board.team );
            expect( outsiderIds ).not.toContain( board.closed );
        });

        it('읽기 권한이 없으면 목록·상세·글쓰기 모두 404 (403이 아니라 게시판이 있는지도 숨긴다)', async () => {
            await http().get( posts( board.team ) ).set( auth( token.outsider ) ).expect( 404 );
            await http().get( `${posts( board.team )}/${post.team}` ).set( auth( token.outsider ) ).expect( 404 );
            await http().post( posts( board.team ) ).set( auth( token.outsider ) ).send({ title: '침입' }).expect( 404 );
        });
    });

    describe('동작별 권한', () => {
        it('읽기만 허용된 게시판: 목록·상세·댓글 조회는 200, 글쓰기·댓글 쓰기는 403', async () => {
            await http().get( posts( board.open ) ).set( auth( token.member ) ).expect( 200 );
            await http().get( `${posts( board.open )}/${post.open}` ).set( auth( token.member ) ).expect( 200 );
            await http().get( `${posts( board.open )}/${post.open}/comments` ).set( auth( token.member ) ).expect( 200 );

            await http().post( posts( board.open ) ).set( auth( token.member ) ).send({ title: '글' }).expect( 403 );
            await http().post( `${posts( board.open )}/${post.open}/comments` ).set( auth( token.member ) ).send({ comment: '댓글' }).expect( 403 );
        });

        it('수정은 작성자만 (게시판 관리 권한이 있어도 남의 글은 수정 불가)', async () => {
            const path = `${posts( board.team )}/${post.team}`;

            await http().patch( path ).set( auth( token.member2 ) ).send({ title: '남이 수정' }).expect( 403 );
            await http().patch( path ).set( auth( token.leader ) ).send({ title: '팀장이 수정' }).expect( 403 );
            await http().patch( path ).set( auth( token.member ) ).send({ title: '작성자가 수정' }).expect( 200 );
        });

        it('삭제는 작성자 또는 게시판 관리 권한', async () => {
            const path = `${posts( board.team )}/${post.team}`;

            await http().delete( path ).set( auth( token.member2 ) ).expect( 403 );
            await http().delete( path ).set( auth( token.leader ) ).expect( 200 );
            await http().get( path ).set( auth( token.member ) ).expect( 404 );
        });
    });

    describe('URL 조작', () => {
        // outsider는 사내 소식은 읽을 수 있지만 개발팀 게시판은 못 읽는다.
        // 읽을 수 있는 게시판 id를 URL에 넣고 남의 게시판 글 id를 붙여도, 글의 게시판이 URL과 다르면 404.
        // 비밀글이 아닌 글로 확인한다. (비밀글이면 이 확인이 없어도 비밀글 검사에서 403으로 막혀 확인이 빠진 것을 잡지 못한다)
        it('읽을 수 있는 게시판 주소에 다른 게시판의 글 id를 붙이면 404', async () => {
            await http().get( `${posts( board.team )}/${post.teamKept}` ).set( auth( token.member ) ).expect( 200 ); // 원래 주소로는 보인다

            await http().get( `${posts( board.open )}/${post.teamKept}` ).set( auth( token.outsider ) ).expect( 404 );
            await http().get( `${posts( board.open )}/${post.teamKept}/comments` ).set( auth( token.outsider ) ).expect( 404 );
        });
    });

    describe('비밀글', () => {
        it('같은 게시판 회원이어도 작성자·게시판 관리 권한이 아니면 403', async () => {
            const path = `${posts( board.team )}/${post.secret}`;

            await http().get( path ).set( auth( token.member2 ) ).expect( 403 );
            await http().get( path ).set( auth( token.member ) ).expect( 200 );  // 작성자
            await http().get( path ).set( auth( token.leader ) ).expect( 200 );  // 게시판 관리 권한
            await http().get( path ).set( auth( token.admin ) ).expect( 200 );   // 게시판 관리 기능을 가진 관리자
        });

        it('비밀글을 볼 수 없으면 댓글도 보거나 쓸 수 없다', async () => {
            const comments = `${posts( board.team )}/${post.secret}/comments`;

            await http().get( comments ).set( auth( token.member2 ) ).expect( 403 );
            await http().post( comments ).set( auth( token.member2 ) ).send({ comment: '댓글' }).expect( 403 );
        });
    });
});
