import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes( new ValidationPipe({
    transform: true, // 요청 데이터를 DTO 타입으로 변환
    whitelist: true, // DTO에 정의되지 않은 속성 제거
    forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성 존재 시 에러 발생
  }) );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
