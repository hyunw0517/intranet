import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
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