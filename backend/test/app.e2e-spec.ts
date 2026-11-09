import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { resetDatabase } from './utils/reset-database';

//* e2e 환경 확인용 (테스트 DB 연결·초기화·앱 기동)
// 실제 업무 e2e(회의실 동시 예약 등)는 기능별 파일로 추가한다.
describe('e2e 환경', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;

    beforeAll( async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [ AppModule ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        prisma = app.get( PrismaService );
        await resetDatabase( prisma );
    });

    afterAll( async () => {
        await app.close();
    });

    it('앱이 .env가 아니라 .env.test의 테스트 DB에 연결된다', async () => {
        expect( app.get( ConfigService ).get<string>( 'DATABASE_URL' ) ).toContain( '/intranet_test' );

        const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
        expect( db ).toBe( 'intranet_test' );
    });

    it('resetDatabase 후 테이블이 비어 있고 id는 1부터 다시 시작한다', async () => {
        expect( await prisma.users.count() ).toBe( 0 );

        const position = await prisma.position.create({ data: { name: '사원', createdId: 0, updatedId: 0 } });
        expect( position.id ).toBe( 1 );

        await resetDatabase( prisma );
        expect( await prisma.position.count() ).toBe( 0 );
    });

    it('GET / (공개 경로)', () => {
        return request( app.getHttpServer() ).get( '/' ).expect( 200 ).expect( 'Hello World!' );
    });
});
