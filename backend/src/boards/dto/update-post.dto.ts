import { OmitType, PartialType } from "@nestjs/mapped-types";
import { IsNotEmpty, IsString, Length } from "class-validator";
import { CreatePostDto } from "./create-post.dto";

// 고정 여부(isPinned)는 수정에서 제외한다. (고정·해제는 별도 API, 게시판 관리 권한)
export class UpdatePostDto extends PartialType(OmitType(CreatePostDto, ['title', 'isPinned'] as const)) {
    
    @IsString()
    @Length(1, 100)
    @IsNotEmpty()
    title: string;
    
}
