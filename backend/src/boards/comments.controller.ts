import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";

@Controller('boards/:boardId/posts/:postId/comments')
export class CommentsController {

    constructor(
        private readonly commentsService: CommentsService,
    ) {}

    //* 댓글 조회 (페이지)
    @Get()
    @Roles(UserRole.USER)
    getComments(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.commentsService.paginateComment( user, boardId, postId );
    }

    //* 댓글 작성
    @Post()
    @Roles(UserRole.USER)
    postComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() body: CreateCommentDto,
    ) {
        return this.commentsService.createComment( user, boardId, postId, body );
    }

    //* 댓글 수정
    @Patch(':commentId')
    @Roles(UserRole.USER)
    patchComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('commentId', ParseIntPipe) commentId: number,
        @Body() body: UpdateCommentDto,
    ) {
        return this.commentsService.updateComment( user, boardId, postId, commentId, body );
    }
    
    //* 댓글 삭제
    @Delete(':commentId')
    @Roles(UserRole.USER)
    deleteComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('commentId', ParseIntPipe) commentId: number,
    ) {
        return this.commentsService.deleteComment( user, boardId, postId, commentId );
    }
}