import { IsBoolean } from "class-validator";

//* 게시글 고정·해제 (PATCH boards/:boardId/posts/:postId/pin)
export class PinPostDto {

    /** true: 고정, false: 해제 */
    @IsBoolean()
    isPinned: boolean;

}
