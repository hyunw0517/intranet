//! 프로필 사진 e2e (마이페이지)
// - 이미지 업로드(POST /common/files/images) → PUT /users/me/profile-image로 연결, 회원당 1장(교체 시 이전 사진 soft delete)
// - 내가 올린 미연결 이미지만 연결된다. 첨부·다른 사람 파일이면 400
// - GET /users/me와 채팅 회원 응답에 썸네일 공개 주소(profileImageUrl)가 나온다
// - 승인 대기(GUEST)는 등록할 수 없다

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import sharp from 'sharp';
import { FileTargetType, UserRole } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatsModule } from 'src/chats/chats.module';
import { createTestApp } from './utils/app';
import { createTestUser, loginAs } from './utils/auth';
import { resetDatabase } from './utils/reset-database';

describe('프로필 사진', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let png: Buffer;
    let memberId: number;
    let otherId: number;

    const token = { member: '', other: '', guest: '' };
    const http = () => request( app.getHttpServer() );
    const auth = ( value: string ) => ({ Authorization: `Bearer ${value}` });

    const uploadImage = async ( tokenValue: string ) => {
        const res = await http().post( '/common/files/images' ).set( auth( tokenValue ) ).attach( 'file', png, 'me.png' ).expect( 201 );
        return res.body as { id: number; thumbnailUrl: string };
    };
    const setProfile = ( tokenValue: string, fileId: number ) =>
        http().put( '/users/me/profile-image' ).set( auth( tokenValue ) ).send( { fileId } );

    beforeAll( async () => {
        // AppModule의 애드온 등록은 import 시점(.env.test, 채팅 없음)에 정해지므로 채팅 모듈은 직접 붙인다
        app = await createTestApp( [ ChatsModule ] );
        prisma = app.get( PrismaService );
        await resetDatabase( prisma );

        png = await sharp( { create: { width: 64, height: 64, channels: 3, background: '#3366ff' } } ).png().toBuffer();

        const member = await createTestUser( prisma, UserRole.USER );
        const other = await createTestUser( prisma, UserRole.USER );
        const guest = await createTestUser( prisma, UserRole.GUEST );
        memberId = member.id;
        otherId = other.id;

        token.member = await loginAs( app, member.empNo );
        token.other = await loginAs( app, other.empNo );
        token.guest = await loginAs( app, guest.empNo );
    });

    afterAll( async () => {
        await app.close();
    });

    it('사진이 없으면 profileImageUrl은 null', async () => {
        const res = await http().get( '/users/me' ).set( auth( token.member ) ).expect( 200 );
        expect( res.body.profileImageUrl ).toBeNull();
    });

    it('업로드한 이미지를 연결하면 내 정보에 썸네일 주소가 나오고, 로그인 없이 열린다', async () => {
        const file = await uploadImage( token.member );

        const res = await setProfile( token.member, file.id ).expect( 200 );
        expect( res.body.profileImageUrl ).toBe( file.thumbnailUrl );
        expect( res.body.password ).toBeUndefined();

        const me = await http().get( '/users/me' ).set( auth( token.member ) ).expect( 200 );
        expect( me.body.profileImageUrl ).toBe( file.thumbnailUrl );

        // /api 접두사는 Next.js rewrite·Nginx가 떼므로 테스트에서는 뗀다
        await http().get( file.thumbnailUrl.replace( /^\/api/, '' ) ).expect( 200 ).expect( 'Content-Type', /image\/webp/ );
    });

    it('새 사진으로 바꾸면 이전 사진은 soft delete되고 1장만 남는다', async () => {
        const before = await prisma.files.findFirstOrThrow({ where: { targetType: FileTargetType.USER_PROFILE, targetId: memberId, deleted: false } });
        const file = await uploadImage( token.member );

        await setProfile( token.member, file.id ).expect( 200 );

        const rows = await prisma.files.findMany({ where: { targetType: FileTargetType.USER_PROFILE, targetId: memberId, deleted: false } });
        expect( rows.map( ( r ) => r.id ) ).toEqual( [ file.id ] );
        expect( ( await prisma.files.findUniqueOrThrow({ where: { id: before.id } }) ).deleted ).toBe( true );
    });

    it('다른 사람이 올린 이미지·첨부·이미 쓰인 이미지는 연결할 수 없다 (400)', async () => {
        const othersFile = await uploadImage( token.other );
        await setProfile( token.member, othersFile.id ).expect( 400 );

        const attachment = await http().post( '/common/files/attachments' ).set( auth( token.member ) ).attach( 'file', png, 'a.png' ).expect( 201 );
        await setProfile( token.member, attachment.body.id ).expect( 400 );

        // 다른 회원이 프로필로 쓰고 있는 이미지
        await setProfile( token.other, othersFile.id ).expect( 200 );
        await setProfile( token.member, othersFile.id ).expect( 400 );
    });

    it('승인 대기(GUEST)는 등록할 수 없다 (403)', async () => {
        await setProfile( token.guest, 1 ).expect( 403 );
        await http().delete( '/users/me/profile-image' ).set( auth( token.guest ) ).expect( 403 );
    });

    it('채팅 상대 검색·1:1 방 응답에 상대 사진 주소가 나온다', async () => {
        const otherUrl = ( await http().get( '/users/me' ).set( auth( token.other ) ).expect( 200 ) ).body.profileImageUrl as string;
        expect( otherUrl ).toMatch( /^\/api\/common\/files\/thumbnails\// );

        const search = await http().get( '/chats/users' ).set( auth( token.member ) ).expect( 200 );
        const found = ( search.body as { id: number; profileImageUrl: string | null }[] ).find( ( u ) => u.id === otherId );
        expect( found?.profileImageUrl ).toBe( otherUrl );

        const opened = await http().post( '/chats/direct' ).set( auth( token.member ) ).send( { userId: otherId } );
        expect( [ 200, 201 ] ).toContain( opened.status );
        const roomId = opened.body.id as number;

        const room = await http().get( `/chats/${roomId}` ).set( auth( token.member ) ).expect( 200 );
        expect( room.body.otherUser.profileImageUrl ).toBe( otherUrl );

        const list = await http().get( '/chats' ).set( auth( token.member ) ).expect( 200 );
        expect( list.body.find( ( r: { id: number } ) => r.id === roomId ).otherUser.profileImageUrl ).toBe( otherUrl );
    });

    it('삭제하면 null이 되고, 사진이 없어도 삭제는 성공한다', async () => {
        const res = await http().delete( '/users/me/profile-image' ).set( auth( token.member ) ).expect( 200 );
        expect( res.body.profileImageUrl ).toBeNull();

        await http().delete( '/users/me/profile-image' ).set( auth( token.member ) ).expect( 200 );
        expect( await prisma.files.count({ where: { targetType: FileTargetType.USER_PROFILE, targetId: memberId, deleted: false } }) ).toBe( 0 );
    });
});
