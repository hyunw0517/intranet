import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AUTH_THROTTLE_LIMIT, AUTH_THROTTLE_TTL_MS } from './auth/const/login-lock.const';
import { RequestContextMiddleware } from './common/context/request-context';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AccessTokenGuard } from './auth/guard/bearer-token.guard';
import { APP_FILTER, APP_GUARD } from '@nestjs/core/constants';
import { AllExceptionsFilter } from './common/filter/all-exceptions.filter';
import { RolesGuard } from './auth/guard/roles.guard';
import { OrganizationModule } from './organization/organization.module';
import { BoardsModule } from './boards/boards.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      envFilePath: '.env', 
      isGlobal: true
    }),
    ScheduleModule.forRoot(), // @Cron 배치 (알림 보관 기간 정리, 없는 사번 로그인 실패 기록 정리)
    // IP당 요청 수 제한 - 전역 가드로 걸지 않고 로그인·가입 라우트에만 @UseGuards(ThrottlerGuard)로 적용한다.
    // 카운터는 서버 메모리에 둔다. (서버 1대 기준. 여러 대로 늘리면 Redis 등 공용 저장소로 바꿔야 한다)
    ThrottlerModule.forRoot({
      throttlers: [ { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT } ],
      errorMessage: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    }),
    PrismaModule, 
    CommonModule, 
    UsersModule, 
    AuthModule, 
    OrganizationModule, 
    BoardsModule, 
    // 애드온: backend/.env의 ADDONS에 있는 것만 등록된다. (src/config/addons.config.ts, AGENTS.md 10.1)
    // ex) addonModule( 'reservations', ReservationsModule ),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER, // 전역 예외 필터: 5xx를 요청 정보(메서드·경로·작업자)와 스택과 함께 기록
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  // 요청 컨텍스트(AsyncLocalStorage): 감사 로그가 작업자·IP·User-Agent를 서비스 인자 없이 읽도록 모든 요청에 적용
  configure( consumer: MiddlewareConsumer ) {
    consumer.apply( RequestContextMiddleware ).forRoutes( '*' );
  }
}
