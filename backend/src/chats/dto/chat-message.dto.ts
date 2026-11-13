import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { CHAT_MESSAGE_MAX_LENGTH } from '../const/chat.const';

//* 메시지 보내기·수정 (텍스트만, 파일 메시지는 다음 단계)
// 앞뒤 공백만 있는 메시지는 보내지 않는다. 줄바꿈·중간 공백은 그대로 둔다.
export class ChatMessageContentDto {

    @Transform( ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value )
    @IsString()
    @Length( 1, CHAT_MESSAGE_MAX_LENGTH )
    content: string;
}
