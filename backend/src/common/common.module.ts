import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileStorage } from './storage/file-storage';
import { LocalFileStorage } from './storage/local-file-storage';
import { AuditService } from './audit.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// 핵심 공통 모듈: 파일·알림·감사 로그. 업무 모듈(users·auth·boards·애드온)을 import하지 않는다.
// (업무 모듈이 이 모듈을 import해 AuditService 등을 호출하므로, 반대로 import하면 순환 참조가 된다)
@Module({
  controllers: [CommonController, FilesController, NotificationsController],
  providers: [
    CommonService,
    FilesService,
    AuditService,
    NotificationsService,
    // 파일 저장소: 운영에서 S3를 쓰면 S3FileStorage를 만들어 반영.
    { provide: FileStorage, useClass: LocalFileStorage },
  ],
  exports: [CommonService, FilesService, AuditService, NotificationsService],
  imports: [
     PrismaModule,
  ],
})
export class CommonModule {}
