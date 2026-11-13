import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";
import { MAX_ATTACHMENTS_PER_TARGET } from "src/common/const/file.const";
import { CalendarEventColor } from "src/generated/prisma/client";
import { StringToBoolean } from "src/common/decorator/string-to-boolean.decorator";
import { StringToDate } from "src/common/decorator/string-to-date.decorator";

//* 게시판 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreatePostDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    title: string;

    @IsString()
    @IsOptional()
    content?: string;

    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isPinned?: boolean;
    
    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isSecret?: boolean;

    @StringToDate()
    @IsDate()
    @IsOptional()
    eventStartAt?: Date | null;

    @StringToDate()
    @IsDate()
    @IsOptional()
    eventEndAt?: Date | null;
    
    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isAllDay?: boolean | null;

    // 일정 색 (캘린더 게시판만, null = 기본색). 수정에서 생략하면 기존 색 유지
    @IsEnum(CalendarEventColor)
    @IsOptional()
    eventColor?: CalendarEventColor | null;

    // 첨부파일 id 최종 목록 (POST /common/files/attachments로 먼저 올린 파일, 순서 = 표시 순서)
    // 작성: 없으면 첨부 없음 / 수정: 없으면 기존 첨부 유지, 배열이면 이 목록으로 맞춤 (빠진 파일은 삭제)
    // 본문 이미지는 따로 보내지 않는다. (서버가 본문 <img>에서 찾아 연결)
    @IsArray()
    @IsInt({ each: true })
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsOptional()
    attachmentIds?: number[];

}
