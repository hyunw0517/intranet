import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";
import { StringToNumber } from "src/common/decorator/string-to-number.decorator";

//* 게시판 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreateCommentDto {

    @IsInt()
    @IsOptional()
    @StringToNumber()
    @EmptyToNull()
    parentCommentId?: number | null;

    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    comment: string;
    
}
