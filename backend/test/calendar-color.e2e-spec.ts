//! 캘린더 일정 색 e2e (features.md 5.3, 2026-11-12 사용자 결정: 정해진 색 중 일정마다 작성자가 선택, null = 기본색)
// 확인: 캘린더 게시판 글에 색 저장·일정 조회 응답에 포함, 수정에서 생략하면 유지·null이면 기본색, 정해진 색 외 400, 일반 게시판은 무시(null)

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('캘린더 일정 색', () => {
    let app: INestApplication<App>;
    let http: () => ReturnType<typeof request>;
    let token = '';
    let calendarId = 0;
    let normalId = 0;

    const auth = () => ({ Authorization: `Bearer ${token}` });
    const event = ( extra: Record<string, unknown> = {} ) => ({
        title: '팀 회의', content: '<p>회의</p>',
        eventStartAt: '2026-12-01T10:00:00+09:00', eventEndAt: '2026-12-01T11:00:00+09:00', isAllDay: false,
        ...extra,
    });
    const range = `start=${encodeURIComponent( '2026-12-01T00:00:00+09:00' )}&end=${encodeURIComponent( '2026-12-02T00:00:00+09:00' )}`;

    beforeAll( async () => {
        app = await createTestApp();
        http = () => request( app.getHttpServer() );
        const prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        // 권한 규칙이 없는 게시판은 관리자만 쓰고 본다
        const admin = await createTestUser( prisma, UserRole.ADMIN );
        token = await loginAs( app, admin.empNo );
        calendarId = ( await http().post( '/boards' ).set( auth() ).send({ type: 'CALENDAR', name: '일정' }).expect( 201 ) ).body.id;
        normalId = ( await http().post( '/boards' ).set( auth() ).send({ type: 'NORMAL', name: '자유' }).expect( 201 ) ).body.id;
    });

    afterAll( async () => {
        await app.close();
    });

    it('색을 고르면 저장되고 일정 조회에 실린다, 생략하면 기본색(null)', async () => {
        const red = await http().post( `/boards/${calendarId}/posts` ).set( auth() ).send( event({ eventColor: 'RED' }) ).expect( 201 );
        const plain = await http().post( `/boards/${calendarId}/posts` ).set( auth() ).send( event({ title: '기본' }) ).expect( 201 );

        const events = await http().get( `/boards/${calendarId}/events?${range}` ).set( auth() ).expect( 200 );
        const colorOf = ( id: number ) => events.body.events.find( ( e: { id: number } ) => e.id === id ).eventColor;
        expect( colorOf( red.body.id ) ).toBe( 'RED' );
        expect( colorOf( plain.body.id ) ).toBeNull();
    });

    it('수정: 생략하면 기존 색 유지, null이면 기본색, 정해진 색이 아니면 400', async () => {
        const created = await http().post( `/boards/${calendarId}/posts` ).set( auth() ).send( event({ eventColor: 'BLUE' }) ).expect( 201 );
        const path = `/boards/${calendarId}/posts/${created.body.id}`;
        const detail = async () => ( await http().get( path ).set( auth() ).expect( 200 ) ).body;

        await http().patch( path ).set( auth() ).send( event({ title: '이름만 변경' }) ).expect( 200 );
        expect( ( await detail() ).eventColor ).toBe( 'BLUE' );

        await http().patch( path ).set( auth() ).send( event({ eventColor: null }) ).expect( 200 );
        expect( ( await detail() ).eventColor ).toBeNull();

        await http().patch( path ).set( auth() ).send( event({ eventColor: 'GREEN' }) ).expect( 400 ); // 초록은 휴가 항목 색이라 없음
    });

    it('일반 게시판은 색을 무시한다(null)', async () => {
        const created = await http().post( `/boards/${normalId}/posts` ).set( auth() ).send({ title: '글', content: '<p>내용</p>', eventColor: 'RED' }).expect( 201 );
        const detail = await http().get( `/boards/${normalId}/posts/${created.body.id}` ).set( auth() ).expect( 200 );
        expect( detail.body.eventColor ).toBeNull();
    });
});
