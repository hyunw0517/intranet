import { Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { PostsService } from "./posts.service";
import { Roles } from "src/auth/decorator/roles.decorator";
import { UserRole, Users } from "src/generated/prisma/client";
import { User } from "src/auth/decorator/user.decorator";
import { PaginatePostQueryDto } from "./dto/paginate-post-query.dto";

@Controller('boards')
export class PostsController {

    constructor( 
        private readonly postsService: PostsService,
    ) {}

    //* 게시글 조회 (페이지네이션)
    @Get(':boardId/posts')
    @Roles(UserRole.USER)
    getPosts(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Query() query: PaginatePostQueryDto,
    ) {
        return this.postsService.paginatePost( user, boardId, query );
    }

    @Post(':boardId/posts')
    @Roles(UserRole.USER)
    postPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
    ) {
        //return this.postsService.createPost( user, boardId );
    }

    @Patch(':boardId/posts')
    @Roles(UserRole.USER)
    patchPost(
        @User() user: Pick<Users, 'id' | 'role'>,
        @Param('boardId', ParseIntPipe) boardId: number,
    ) {
        //return this.postsService.updatePost( user, boardId );
    }
}