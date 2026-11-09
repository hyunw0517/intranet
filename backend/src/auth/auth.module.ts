import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthSessionsService } from './auth-sessions.service';
import { CommonModule } from 'src/common/common.module';
import { LoginHistoryService } from './login-history.service';
import { AuthNotifier } from './auth-notifier';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    UsersModule,
    PrismaModule, // AuthSessionsService (로그인 세션 테이블)
    CommonModule, // 감사 로그 (로그인·로그아웃·비밀번호·토큰 재사용)
  ],
  exports: [
    AuthService,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionsService, LoginHistoryService, AuthNotifier],
})
export class AuthModule {}
