import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

//* 앱 전역 설정 - main.ts(실제 서버)와 e2e 테스트가 같은 설정을 쓰도록 한곳에 둔다.
// (테스트의 createNestApplication()은 main.ts를 거치지 않으므로, 여기 없으면 테스트에서만 DTO 변환·검증이 빠진다)
export function configureApp( app: NestExpressApplication ) {

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

  return app;
}
