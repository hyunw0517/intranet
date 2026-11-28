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
    PrismaModule,
    CommonModule, // 감사 로그·알림
  ],
  exports: [
    AuthService,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSessionsService, LoginHistoryService, AuthNotifier],
})
export class AuthModule {}
