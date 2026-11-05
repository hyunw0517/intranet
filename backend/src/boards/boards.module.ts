import { Module } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BoardAuthController } from './board-auth.controller';
import { BoardAuthService } from './board-auth.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { OrganizationModule } from 'src/organization/organization.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    PrismaModule,
    OrganizationModule, // 작성자 소속 조회용
    CommonModule,       // FilesService (첨부·본문 이미지)
  ],
  controllers: [
    BoardAuthController,
    BoardsController,
    PostsController,
    CommentsController,
  ],
  providers: [
    BoardAuthService,
    BoardsService,
    PostsService,
    CommentsService,
  ],
})
export class BoardsModule {}
