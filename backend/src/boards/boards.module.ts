import { Module } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BoardAuthController } from './board-auth.controller';
import { BoardAuthService } from './board-auth.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { OrganizationModule } from 'src/organization/organization.module';

@Module({
  imports: [
    PrismaModule,
    OrganizationModule, // 작성자 소속 조회용
  ],
  controllers: [
    BoardAuthController,
    BoardsController,
    PostsController,
  ],
  providers: [
    BoardAuthService,
    BoardsService,
    PostsService,
  ],
})
export class BoardsModule {}
