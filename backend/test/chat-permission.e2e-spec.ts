//! 채팅 메시지 권한 e2e (features.md)
// - 메시지 조회·보내기는 활성 참여자만. 참여하지 않은 방은 404 (방이 있는지 알려 주지 않는다), GUEST는 403
// - 참여 시점 이후 메시지만 보인다 (나중에 초대된 사람은 초대 전 대화를 못 본다)
// - 나간 사람은 더 이상 보거나 보낼 수 없고, 남은 사람끼리는 계속 보낸다
// - 1:1 상대가 재직 중이 아니면 읽기 전용: 기록은 보이고 보내기는 403
// - 수정·삭제는 본인 메시지만, 보낸 뒤 5분 이내. 삭제한 메시지는 내용을 비워 내려주고 다시 수정할 수 없다
// 채팅은 애드온이라 .env.test의 ADDONS에 없다. 채팅 모듈은 테스트 앱에 직접 붙인다. (profile-image.e2e-spec.ts와 같은 방식)
// 5분 경과는 기다릴 수 없으므로 메시지의 createdAt을 직접 과거로 옮긴다.

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ChatsModule } from 'src/chats/chats.module';
import { UserRole, UserStatus } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

interface Message {
    id: number;
    content: string | null;
}

describe('채팅 메시지 권한', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    // 그룹 방: owner·member·leaver / 방 밖: outsider(나중에 초대됨), guest / 1:1: owner ↔ partner(퇴사 처리됨)
    const token = { owner: '', member: '', leaver: '', outsider: '', guest: '' };
    let partnerId = 0;
    let outsiderId = 0;
    let groupId = 0;
    let directId = 0;

    const http = () => request( app.getHttpServer() );
    const auth = ( t: string ) => ({ Authorization: `Bearer ${t}` });
    const messages = ( roomId: number ) => `/chats/${roomId}/messages`;

    const send = ( t: string, roomId: number, content: string ) => http().post( messages( roomId ) ).set( auth( t ) ).send({ content });
    const list = async ( t: string, roomId: number ) =>
        ( ( await http().get( messages( roomId ) ).set( auth( t ) ).expect( 200 ) ).body as { data: Message[] } ).data;

    beforeAll( async () => {
        app = await createTestApp( [ ChatsModule ] );
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        const owner = await createTestUser( prisma, UserRole.USER );
        const member = await createTestUser( prisma, UserRole.USER );
        const leaver = await createTestUser( prisma, UserRole.USER );
        const outsider = await createTestUser( prisma, UserRole.USER );
        const partner = await createTestUser( prisma, UserRole.USER );
        const guest = await createTestUser( prisma, UserRole.GUEST );
        partnerId = partner.id;
        outsiderId = outsider.id;

        token.owner = await loginAs( app, owner.empNo );
        token.member = await loginAs( app, member.empNo );
        token.leaver = await loginAs( app, leaver.empNo );
        token.outsider = await loginAs( app, outsider.empNo );
        token.guest = await loginAs( app, guest.empNo );

        groupId = ( ( await http().post( '/chats/group' ).set( auth( token.owner ) ).send({ userIds: [ member.id, leaver.id ] }).expect( 201 ) ).body as { id: number } ).id;
        directId = ( ( await http().post( '/chats/direct' ).set( auth( token.owner ) ).send({ userId: partner.id }).expect( 201 ) ).body as { id: number } ).id;
    }, 30000 ); // 앱 기동 + 로그인 5회라 전체 e2e를 함께 돌리면 기본 5초를 넘길 수 있다

    afterAll( async () => {
        await app.close();
    });

    describe('참여자만', () => {
        it('참여하지 않은 방은 조회·보내기·방 정보 모두 404', async () => {
            await http().get( messages( groupId ) ).set( auth( token.outsider ) ).expect( 404 );
            await send( token.outsider, groupId, '끼어들기' ).expect( 404 );
            await http().get( `/chats/${groupId}` ).set( auth( token.outsider ) ).expect( 404 );
        });

        it('GUEST(가입 승인 전)는 채팅 API를 쓸 수 없다 (403)', async () => {
            await http().get( '/chats' ).set( auth( token.guest ) ).expect( 403 );
            await send( token.guest, groupId, '안녕' ).expect( 403 );
        });

        it('참여자가 보내면 다른 참여자도 같은 메시지를 본다', async () => {
            const sent = ( await send( token.owner, groupId, '첫 메시지' ).expect( 201 ) ).body as Message;

            const seen = await list( token.member, groupId );
            expect( seen.find( ( m ) => m.id === sent.id )?.content ).toBe( '첫 메시지' );
        });

        it('나중에 초대된 사람은 초대 전 대화를 보지 못하고, 초대 후에는 보낼 수 있다', async () => {
            const before = ( await send( token.owner, groupId, '초대 전 대화' ).expect( 201 ) ).body as Message;

            await http().post( `/chats/${groupId}/members` ).set( auth( token.owner ) ).send({ userIds: [ outsiderId ] }).expect( 201 );

            const seen = await list( token.outsider, groupId );
            expect( seen.every( ( m ) => m.id > before.id ) ).toBe( true );

            await send( token.outsider, groupId, '들어왔습니다' ).expect( 201 );
        });

        it('방을 나가면 더 이상 보거나 보낼 수 없고, 남은 사람은 계속 보낸다', async () => {
            await http().post( `/chats/${groupId}/leave` ).set( auth( token.leaver ) ).send({}).expect( 201 );

            await http().get( messages( groupId ) ).set( auth( token.leaver ) ).expect( 404 );
            await send( token.leaver, groupId, '나간 뒤' ).expect( 404 );

            await send( token.member, groupId, '남은 사람' ).expect( 201 );
        });

        it('1:1 상대가 퇴사하면 읽기 전용: 기록은 보이고 보내기는 403', async () => {
            const sent = ( await send( token.owner, directId, '퇴사 전 대화' ).expect( 201 ) ).body as Message;

            await prisma.users.update({ where: { id: partnerId }, data: { status: UserStatus.RESIGNED } });

            await send( token.owner, directId, '퇴사 후' ).expect( 403 );
            expect( ( await list( token.owner, directId ) ).map( ( m ) => m.id ) ).toContain( sent.id );
        });
    });

    describe('수정 · 삭제', () => {
        const messagePath = ( messageId: number ) => `${messages( groupId )}/${messageId}`;

        it('본인 메시지만 수정·삭제할 수 있다 (같은 방 참여자여도 403)', async () => {
            const sent = ( await send( token.owner, groupId, '원래 내용' ).expect( 201 ) ).body as Message;

            await http().patch( messagePath( sent.id ) ).set( auth( token.member ) ).send({ content: '남이 수정' }).expect( 403 );
            await http().delete( messagePath( sent.id ) ).set( auth( token.member ) ).expect( 403 );

            await http().patch( messagePath( sent.id ) ).set( auth( token.owner ) ).send({ content: '고친 내용' }).expect( 200 );
            const seen = await list( token.member, groupId );
            expect( seen.find( ( m ) => m.id === sent.id )?.content ).toBe( '고친 내용' );
        });

        it('보낸 뒤 5분이 지나면 본인도 수정·삭제할 수 없다 (400)', async () => {
            const sent = ( await send( token.owner, groupId, '오래된 메시지' ).expect( 201 ) ).body as Message;
            await prisma.chatMessage.update({ where: { id: sent.id }, data: { createdAt: new Date( Date.now() - 6 * 60 * 1000 ) } });

            await http().patch( messagePath( sent.id ) ).set( auth( token.owner ) ).send({ content: '수정' }).expect( 400 );
            await http().delete( messagePath( sent.id ) ).set( auth( token.owner ) ).expect( 400 );
        });

        it('삭제한 메시지는 내용을 비워 내려주고, 다시 수정할 수 없다', async () => {
            const sent = ( await send( token.owner, groupId, '지울 메시지' ).expect( 201 ) ).body as Message;

            await http().delete( messagePath( sent.id ) ).set( auth( token.owner ) ).expect( 200 );

            const seen = await list( token.member, groupId );
            expect( seen.find( ( m ) => m.id === sent.id )?.content ).toBeNull();
            await http().patch( messagePath( sent.id ) ).set( auth( token.owner ) ).send({ content: '되살리기' }).expect( 400 );
        });
    });
});
