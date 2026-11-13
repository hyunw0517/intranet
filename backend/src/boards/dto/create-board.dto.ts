import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToBoolean } from 'src/common/decorator/string-to-boolean.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { BoardType } from 'src/generated/prisma/client';

//* 게시판 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreateBoardDto {

    // 상위 게시판 id (최상위는 NULL, 상위는 CATEGORY만 가능)
    @IsInt()
    @IsOptional()
    @StringToNumber()
    @EmptyToNull()
    parentBoardId?: number | null;

    // 게시판 구분 (생략 시 NORMAL)
    @IsEnum(BoardType)
    @IsOptional()
    type?: BoardType;

    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

    // 게시판 설명 (빈 문자열이면 NULL로 저장)
    @IsString()
    @MaxLength(250)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;

    // 익명 게시판 여부
    @IsOptional()
    @StringToBoolean()
    @IsBoolean()
    isAnonymous: boolean;

    // 비밀글 허용 여부
    @IsOptional()
    @StringToBoolean()
    @IsBoolean()
    allowSecret: boolean;

    // 휴가자 표시 (캘린더 게시판만 켤 수 있다. 휴가 애드온이 꺼져 있으면 화면이 무시한다)
    @IsOptional()
    @StringToBoolean()
    @IsBoolean()
    showLeaves?: boolean;
}
