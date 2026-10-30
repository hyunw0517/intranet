import { Module } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BoardAuthController } from './board-auth.controller';
import { BoardAuthService } from './board-auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    BoardsController,
    BoardAuthController,
  ],
  providers: [
    BoardsService,
    BoardAuthService,
  ],
})
export class BoardsModule {}
