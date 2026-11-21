import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";
import { MAX_ATTACHMENTS_PER_TARGET } from "src/common/const/file.const";
import { CalendarEventColor } from "src/generated/prisma/client";
import { StringToBoolean } from "src/common/decorator/string-to-boolean.decorator";
import { StringToDate } from "src/common/decorator/string-to-date.decorator";

//* 게시판 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreatePostDto {

    /** 제목 (1~100자) */
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    title: string;

    /** 본문 HTML (에디터 Tiptap). 서버가 저장할 때 허용 태그만 남기고, 쓸 수 없는 이미지는 지운다. 앨범 게시판은 이미지 1개 이상 필수 */
    @IsString()
    @IsOptional()
    content?: string;

    /** 고정 (게시판 관리 권한이 없으면 무시하고 false로 저장, 최대 10개) */
    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isPinned?: boolean;
    
    /** 비밀글 (비밀글을 허용하지 않는 게시판이면 무시하고 false로 저장) */
    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isSecret?: boolean;

    /** 일정 시작 (캘린더 게시판은 필수, ISO 문자열) */
    @StringToDate()
    @IsDate()
    @IsOptional()
    eventStartAt?: Date | null;

    /** 일정 종료 (캘린더 게시판은 필수, 시작보다 빠를 수 없다) */
    @StringToDate()
    @IsDate()
    @IsOptional()
    eventEndAt?: Date | null;
    
    /** 종일 일정 */
    @IsBoolean()
    @IsOptional()
    @StringToBoolean()
    isAllDay?: boolean | null;

    /** 일정 색 (캘린더 게시판만, null = 기본색). 수정에서 생략하면 기존 색 유지 */
    @ApiProperty({ enum: CalendarEventColor, enumName: 'CalendarEventColor', required: false, nullable: true })
    @IsEnum(CalendarEventColor)
    @IsOptional()
    eventColor?: CalendarEventColor | null;

    /**
     * 첨부파일 id 최종 목록 (POST /common/files/attachments로 먼저 올린 파일, 순서 = 표시 순서)
     * 작성: 없으면 첨부 없음 / 수정: 없으면 기존 첨부 유지, 배열이면 이 목록으로 맞춤 (빠진 파일은 삭제)
     * 본문 이미지는 따로 보내지 않는다. (서버가 본문 <img>에서 찾아 연결)
     */
    @IsArray()
    @IsInt({ each: true })
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsOptional()
    attachmentIds?: number[];

}
