import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 응답 JSON의 BigInt를 문자열로 변환 (JSON.stringify BigInt 문제 해결용)
  app.set('json replacer', ( _key: string, value: unknown ) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  // 전역 파이프
  app.useGlobalPipes( new ValidationPipe({
    transform: true, // 요청 데이터를 DTO 타입으로 변환
    whitelist: true, // DTO에 정의되지 않은 속성 제거
    forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성 존재 시 에러 발생
  }) );

  // 쿠키 처리용 (NestJS에서 직접 Set-Cookie)
  app.use(cookieParser());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
