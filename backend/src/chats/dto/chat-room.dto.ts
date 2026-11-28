import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { CHAT_GROUP_NAME_MAX_LENGTH, CHAT_INVITE_MAX } from '../const/chat.const';

//* 채팅 상대 검색 - 이름·사번·부서명 (비우면 이름순으로 앞에서부터)
export class ChatUserSearchQueryDto {

    /** 검색어 (이름·사번·소속 부서명, 겸직 포함. 비우면 이름순으로 앞에서부터) */
    @IsOptional()
    @IsString()
    @MaxLength(50)
    search?: string;
}

//* 1:1 채팅 열기 (있으면 그 방, 없으면 생성)
export class OpenDirectChatDto {

    /** 상대 회원 id */
    @IsInt()
    @Min(1)
    userId: number;
}

//* 그룹 채팅 생성 - userIds에 본인은 넣지 않아도 된다(넣어도 무시). 본인 포함 3명 이상.
// name을 비우면 서버가 참여자 이름으로 만든다
export class CreateGroupChatDto {

    /** 방 이름 (1~50자) */
    @EmptyToNull()
    @IsOptional()
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name?: string | null;

    /** 참여시킬 회원 id (본인은 넣지 않아도 된다, 한 번에 최대 100명) */
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( CHAT_INVITE_MAX )
    @ArrayUnique()
    @IsInt({ each: true })
    userIds: number[];
}

//* 방 기본 이름 변경 (그룹, OWNER만) - 모든 참여자에게 보이는 이름
export class RenameChatRoomDto {

    /** 방 이름 (1~50자) */
    @Transform( ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value )
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name: string;
}

//* 나만 보는 방 이름 (참여자 누구나, 1:1·그룹 모두) - null 또는 빈 문자열이면 기본 이름으로 되돌린다
export class SetMyChatRoomNameDto {

    /** 방 이름 (1~50자) */
    @EmptyToNull()
    @ValidateIf( ( _, value ) => value !== null )
    @IsString()
    @Length( 1, CHAT_GROUP_NAME_MAX_LENGTH )
    name: string | null;
}

//* 그룹 초대 (참여자 누구나)
export class InviteChatMembersDto {

    /** 참여시킬 회원 id (본인은 넣지 않아도 된다, 한 번에 최대 100명) */
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( CHAT_INVITE_MAX )
    @ArrayUnique()
    @IsInt({ each: true })
    userIds: number[];
}

//* 나가기 - OWNER가 그룹을 나갈 때만 nextOwnerId를 쓴다. 생략하면 가장 오래 참여한 사람에게 넘긴다.
export class LeaveChatDto {

    /** 다음 방장 회원 id (그룹 방장이 나갈 때만, 생략하면 가장 오래 참여한 사람) */
    @IsOptional()
    @IsInt()
    @Min(1)
    nextOwnerId?: number;
}

//* 여기까지 읽음
export class ReadChatDto {

    /** 여기까지 읽은 메시지 id (값은 앞으로만 움직인다) */
    @IsInt()
    @Min(1)
    messageId: number;
}
