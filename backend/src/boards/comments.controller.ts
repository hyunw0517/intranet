import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { Roles } from "src/auth/decorator/roles.decorator";
import { User } from "src/auth/decorator/user.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentItemResponse, CommentResponse } from './dto/comment-response.dto';

@ApiTags('Comments (댓글)')
@Controller('boards/:boardId/posts/:postId/comments')
export class CommentsController {

    constructor(
        private readonly commentsService: CommentsService,
    ) {}

    //* 댓글 조회 (전체 트리) - 페이지 없이 전부 준다. 화면이 스레드(최상위 댓글 + 답글) 단위로 나눠 페이지를 만든다.
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '댓글 목록 (트리)', description: '페이지 없이 전체를 트리 순서의 평평한 목록으로 준다(depth로 들여쓰기). 대댓글 깊이 제한 없음. 삭제된 댓글은 답글이 남아 있을 때만 자리(comment·작성자 null)로 남는다. 댓글 권한이 없어도 읽기 권한이 있으면 조회할 수 있다.' })
    @ApiForbiddenResponse({ description: '비밀글 (작성자와 게시판 관리자만)' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    getComments(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ): Promise<CommentItemResponse[]> {
        return this.commentsService.getCommentTree( user, boardId, postId );
    }

    //* 댓글 작성
    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '댓글 작성', description: 'parentCommentId를 주면 대댓글.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 내용이 공백뿐, 원본 댓글을 찾을 수 없음' })
    @ApiForbiddenResponse({ description: '댓글 권한 없음, 비밀글' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    postComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() body: CreateCommentDto,
    ): Promise<CommentResponse> {
        return this.commentsService.createComment( user, boardId, postId, body );
    }

    //* 댓글 수정
    @Patch(':commentId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '댓글 수정', description: '작성자만 수정할 수 있다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 내용이 공백뿐' })
    @ApiForbiddenResponse({ description: '작성자가 아님, 댓글 권한 없음' })
    @ApiNotFoundResponse({ description: '게시판·게시글·댓글이 없음, 또는 읽기 권한이 없음' })
    patchComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('commentId', ParseIntPipe) commentId: number,
        @Body() body: UpdateCommentDto,
    ): Promise<CommentResponse> {
        return this.commentsService.updateComment( user, boardId, postId, commentId, body );
    }
    
    //* 댓글 삭제
    @Delete(':commentId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '댓글 삭제 (soft delete)', description: '작성자 또는 게시판 관리 권한. 답글이 있으면 목록에 자리만 남는다. 응답 본문은 true.' })
    @ApiForbiddenResponse({ description: '댓글 권한 없음, 작성자·게시판 관리자가 아님' })
    @ApiNotFoundResponse({ description: '게시판·게시글·댓글이 없음, 또는 읽기 권한이 없음' })
    deleteComment(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('commentId', ParseIntPipe) commentId: number,
    ): Promise<boolean> {
        return this.commentsService.deleteComment( user, boardId, postId, commentId );
    }
}