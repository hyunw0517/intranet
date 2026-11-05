import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { CommonController } from './common.controller';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { FileStorage } from './storage/file-storage';
import { LocalFileStorage } from './storage/local-file-storage';

@Module({
  controllers: [CommonController, FilesController],
  providers: [
    CommonService,
    FilesService,
    // 파일 저장소: 운영에서 S3를 쓰면 S3FileStorage를 만들어 반영. 
    { provide: FileStorage, useClass: LocalFileStorage },
  ],
  exports: [CommonService, FilesService],
  imports: [
     AuthModule,
     UsersModule,
     PrismaModule,
  ],
})
export class CommonModule {}
