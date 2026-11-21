import { PickType } from '@nestjs/swagger';
import { IsNotEmpty, IsString,  MaxLength } from "class-validator";
import { CreateCommentDto } from "./create-comment.dto";

export class UpdateCommentDto extends PickType(CreateCommentDto, ['comment'] as const) {
    
    /** 댓글 내용 (최대 1000자) */
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    comment: string;
    
}
