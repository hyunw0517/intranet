import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CommonModule } from 'src/common/common.module';
import { UserNotifier } from './user-notifier';
import { UserSearchService } from './user-search.service';

@Module({
  imports: [
    PrismaModule,
    CommonModule, // 감사 로그·알림 (AuditService, NotificationsService)
  ],
  exports: [UsersService],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserNotifier, // 회원 알림 규칙 (가입 승인 대기·승인)
    UserSearchService, // 공용 회원 검색 (회원을 고르는 화면용)
  ],
})
export class UsersModule {}
