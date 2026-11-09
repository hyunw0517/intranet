import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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
    ScheduleModule.forRoot(), // @Cron 배치 (알림 보관 기간 정리)
    PrismaModule, 
    CommonModule, 
    UsersModule, 
    AuthModule, 
    OrganizationModule, 
    BoardsModule, 
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
