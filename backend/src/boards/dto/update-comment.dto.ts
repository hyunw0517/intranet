import { PickType } from "@nestjs/mapped-types";
import { IsNotEmpty, IsString,  MaxLength } from "class-validator";
import { CreateCommentDto } from "./create-comment.dto";

export class UpdateCommentDto extends PickType(CreateCommentDto, ['comment'] as const) {
    
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    comment: string;
    
}
