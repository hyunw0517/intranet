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

//! 채팅 (애드온 'chats') - AppModule에서 addonModule('chats', ChatsModule)로만 등록한다.
// 꺼져 있으면 Gateway도 등록되지 않아 /chats 소켓 namespace와 REST가 모두 없다.
// 핵심(auth: 토큰 검증, common: 감사 로그·파일)을 직접 쓴다. (애드온 → 핵심 허용, 핵심은 이 모듈을 모른다)
@Module({
    imports: [ PrismaModule, CommonModule, AuthModule ],
    controllers: [ ChatMessagesController, ChatFilesController, ChatRoomsController ],
    providers: [ ChatsGateway, ChatEvents, ChatRoomsService, ChatMessagesService ],
})
export class ChatsModule {}
