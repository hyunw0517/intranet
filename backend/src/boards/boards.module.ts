import { Module } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BoardAuthController } from './board-auth.controller';
import { BoardAuthService } from './board-auth.service';

@Module({
  imports: [PrismaModule],
  // 같은 'boards' 경로를 쓰므로 고정 경로(navigation)가 있는 BoardAuthController를 먼저 등록한다.
  // (뒤에 두면 이후 추가될 GET boards/:id가 'navigation'을 id로 받아 ParseIntPipe 400)
  controllers: [
    BoardAuthController,
    BoardsController,
  ],
  providers: [
    BoardsService,
    BoardAuthService,
  ],
})
export class BoardsModule {}
