import { IsBoolean, IsDate, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";
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
    
}
