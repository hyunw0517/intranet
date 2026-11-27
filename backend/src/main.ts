import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.setup';
import { setupSwagger } from './config/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 전역 설정 (BigInt JSON 변환, ValidationPipe, cookieParser) - e2e 테스트와 공유
  configureApp( app );

  // API 문서 (/api/docs) - e2e에는 필요 없으므로 configureApp이 아니라 여기서만 호출
  setupSwagger( app );

  // 바로 앞 프록시 한 단계(운영 nginx)가 넘긴 X-Forwarded-For의 마지막 주소를 req.ip로 쓴다.
  // 없으면 req.ip가 모두 프록시 주소가 되어 IP 요청 수 제한(ThrottlerGuard)을 전 회원이 함께 쓰고, 감사 로그 IP도 프록시 주소로 남는다.
  // 1단계만 믿으므로 사용자가 헤더에 넣은 가짜 주소(앞쪽 값)는 쓰이지 않는다. 백엔드 포트를 외부에 열지 않는 것이 전제다(docker-compose.prod.yaml).
  app.set( 'trust proxy', 1 );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
