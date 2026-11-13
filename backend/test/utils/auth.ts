import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaClient, UserRole } from 'src/generated/prisma/client';

export const TEST_PASSWORD = 'Test1234!';

let seq = 0;

//* 테스트 회원 생성 (재직 중, 비밀번호는 TEST_PASSWORD)
// 사번·이메일은 파일 안에서 겹치지 않게 순번을 붙인다. (resetDatabase 후 다시 1부터 써도 된다)
export async function createTestUser( prisma: PrismaClient, role: UserRole = UserRole.USER ) {
    seq += 1;
    return prisma.users.create({
        data: {
            empNo: `T${String( seq ).padStart( 6, '0' )}`,
            email: `test${seq}@test.com`,
            name: `테스트${seq}`,
            password: await bcrypt.hash( TEST_PASSWORD, 4 ),
            role,
            joinAt: role === UserRole.GUEST ? null : new Date( '2026-01-01' ),
        },
    });
}

//* 실제 로그인 API로 access token 받기 (POST /auth/login/emp, Basic 인증)
export async function loginAs( app: INestApplication<App>, empNo: string, password = TEST_PASSWORD ): Promise<string> {
    const basic = Buffer.from( `${empNo}:${password}` ).toString( 'base64' );
    const res = await request( app.getHttpServer() )
        .post( '/auth/login/emp' )
        .set( 'Authorization', `Basic ${basic}` )
        .expect( 201 );

    return ( res.body as { accessToken: string } ).accessToken;
}
