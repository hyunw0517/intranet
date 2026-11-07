import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { PostsService } from "./posts.service";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { User } from "src/auth/decorator/user.decorator";
import { PaginatePostQueryDto } from "./dto/paginate-post-query.dto";
import { CreatePostDto } from "./dto/create-post.dto";
import { UpdatePostDto } from "./dto/update-post.dto";
import { PinPostDto } from "./dto/pin-post.dto";

@Controller('boards/:boardId/posts')
export class PostsController {

    constructor( 
        private readonly postsService: PostsService,
    ) {}

    //* 게시글 조회 (페이지)
    @Get()
    @Roles(UserRole.USER)
    getPosts(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Query() query: PaginatePostQueryDto,
    ) {
        return this.postsService.paginatePost( user, boardId, query );
    }

    //* 게시글 작성
    @Post()
    @Roles(UserRole.USER)
    postPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Body() createPostDto: CreatePostDto,
    ) {
        return this.postsService.createPost( user, boardId, createPostDto );
    }
    
    //* 게시글 조회 (단일)
    @Get(':postId')
    @Roles(UserRole.USER)
    getPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.postsService.readPost( user, boardId, postId );
    }

    //* 게시글 수정
    @Patch(':postId')
    @Roles(UserRole.USER)
    patchPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() updatePostDto: UpdatePostDto,
    ) {
        return this.postsService.updatePost( user, boardId, postId, updatePostDto );
    }

    //* 게시글 고정·해제 (게시판 관리 권한)
    // ':postId' 뒤에 붙는 고정 경로라 수정 라우트(:boardId/posts/:postId)와 충돌하지 않는다.
    @Patch(':postId/pin')
    @Roles(UserRole.USER)
    pinPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() pinPostDto: PinPostDto,
    ) {
        return this.postsService.pinPost( user, boardId, postId, pinPostDto.isPinned );
    }

    //* 게시글 삭제
    @Delete(':postId')
    @Roles(UserRole.USER)
    deletePost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.postsService.deletePost( user, boardId, postId );
    }

    //* 게시글 좋아요
    @Patch(':postId/like')
    @Roles(UserRole.USER)
    likePost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,

    ){
        return this.postsService.likePost( user, boardId, postId );
    }

    //* 첨부파일 다운로드 (게시글 읽기 권한)
    // 프론트는 <a href>가 아니라 fetch(Bearer 헤더)로 받아 blob으로 저장한다.
    @Get(':postId/files/:fileId')
    @Roles(UserRole.USER)
    async downloadFile(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, originalName, size } = await this.postsService.openAttachment( user, boardId, postId, fileId );

        // 어떤 형식이든 브라우저가 열지(실행하지) 않고 내려받게 한다. (업로드한 html 등이 우리 출처에서 실행되는 것 방지)
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );

        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            // 한글 파일명: RFC 5987 filename* (UTF-8 퍼센트 인코딩), 구형 클라이언트용 filename은 ASCII 대체
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }

    //* 게시글 좋아요 취소
    @Delete(':postId/unlike')
    @Roles(UserRole.USER)
    unlikePost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ) {
        return this.postsService.unlikePost( user, boardId, postId );
    }
}