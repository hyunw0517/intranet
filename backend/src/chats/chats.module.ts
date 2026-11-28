import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ChatEvents } from './chat-events';
import { ChatFilesController } from './chat-files.controller';
import { ChatMessagesController } from './chat-messages.controller';
import { ChatMessagesService } from './chat-messages.service';
import { ChatRoomsController } from './chat-rooms.controller';
import { ChatRoomsService } from './chat-rooms.service';
import { ChatsGateway } from './chats.gateway';

//! 채팅 (애드온 'chats')
// 꺼져 있으면 Gateway도 등록되지 않아 소켓 namespace와 REST가 모두 없다.
@Module({
    imports: [ PrismaModule, CommonModule, AuthModule ],
    controllers: [ ChatMessagesController, ChatFilesController, ChatRoomsController ],
    providers: [ ChatsGateway, ChatEvents, ChatRoomsService, ChatMessagesService ],
})
export class ChatsModule {}
