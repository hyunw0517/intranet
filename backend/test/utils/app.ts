import { ModuleMetadata } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { configureApp } from 'src/app.setup';

//* e2e용 앱 생성: AppModule(+ 테스트에서만 붙이는 모듈) + main.ts와 같은 전역 설정(configureApp)
// createNestApplication()만 쓰면 main.ts의 ValidationPipe 등이 빠져 DTO 변환(문자열 → Date·숫자)이 일어나지 않는다.
export async function createTestApp( extraImports: ModuleMetadata['imports'] = [], appModule: unknown = AppModule ) {
    const moduleRef = await Test.createTestingModule({ imports: [ appModule as never, ...extraImports ] }).compile();
    const app = configureApp( moduleRef.createNestApplication<NestExpressApplication>() );
    await app.init();
    return app;
}
