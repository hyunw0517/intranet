import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 전역 설정 (BigInt JSON 변환, ValidationPipe, cookieParser) - e2e 테스트와 공유
  configureApp( app );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
