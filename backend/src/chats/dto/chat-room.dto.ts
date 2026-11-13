import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { CHAT_GROUP_NAME_MAX_LENGTH, CHAT_INVITE_MAX } from '../const/chat.const';

//* 1:1 채팅 열기 (있으면 그 방, 없으면 생성)
export class OpenDirectChatDto {

    @IsInt()
    @Min(1)
    userId: number;
}

//* 그룹 채팅 생성 - userIds에 본인은 넣지 않아도 된다(넣어도 무시). 본인 포함 3명 이상.
export class CreateGroupChatDto {

    @Transform( ({ value }) => typeof value === 'string' ? value.trim() : value )
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name: string;

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( CHAT_INVITE_MAX )
    @ArrayUnique()
    @IsInt({ each: true })
    userIds: number[];
}

//* 방 기본 이름 변경 (그룹, OWNER만) - 모든 참여자에게 보이는 이름
export class RenameChatRoomDto {

    @Transform( ({ value }) => typeof value === 'string' ? value.trim() : value )
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name: string;
}

//* 나만 보는 방 이름 (참여자 누구나, 1:1·그룹 모두) - null 또는 빈 문자열이면 기본 이름으로 되돌린다
export class SetMyChatRoomNameDto {

    @Transform( ({ value }) => typeof value === 'string' ? ( value.trim() === '' ? null : value.trim() ) : value )
    @ValidateIf( ( _, value ) => value !== null )
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name: string | null;
}

//* 그룹 초대 (참여자 누구나)
export class InviteChatMembersDto {

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( CHAT_INVITE_MAX )
    @ArrayUnique()
    @IsInt({ each: true })
    userIds: number[];
}

//* 나가기 - OWNER가 그룹을 나갈 때만 nextOwnerId를 쓴다. 생략하면 가장 오래 참여한 사람에게 넘긴다.
export class LeaveChatDto {

    @IsOptional()
    @IsInt()
    @Min(1)
    nextOwnerId?: number;
}

//* 여기까지 읽음
export class ReadChatDto {

    @IsInt()
    @Min(1)
    messageId: number;
}
