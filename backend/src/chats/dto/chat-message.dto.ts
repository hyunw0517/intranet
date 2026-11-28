import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { CHAT_MESSAGE_MAX_LENGTH } from '../const/chat.const';

//* 텍스트 메시지 보내기·수정
// 앞뒤 공백만 있는 메시지는 보내지 않는다. 줄바꿈·중간 공백은 그대로 둔다.
export class ChatMessageContentDto {

    /** 메시지 내용 (앞뒤 공백을 지운 뒤 1~2000자, 줄바꿈·중간 공백은 유지) */
    @Transform( ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value )
    @IsString()
    @Length( 1, CHAT_MESSAGE_MAX_LENGTH )
    content: string;
}
