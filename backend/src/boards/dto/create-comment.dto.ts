import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";
import { StringToNumber } from "src/common/decorator/string-to-number.decorator";

//* 댓글 입력 기준 DTO (Update는 이 클래스에서 파생)
export class CreateCommentDto {

    /** 부모 댓글 id (대댓글일 때, 깊이 제한 없음) */
    @IsInt()
    @IsOptional()
    @StringToNumber()
    @EmptyToNull()
    parentCommentId?: number | null;

    /** 댓글 내용 (최대 1000자) */
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    comment: string;
    
}
