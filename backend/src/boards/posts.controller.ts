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
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PostDetailResponse, PostListResponse, PostResponse } from './dto/post-response.dto';

@ApiTags('Posts (게시글)')
@Controller('boards/:boardId/posts')
export class PostsController {

    constructor( 
        private readonly postsService: PostsService,
    ) {}

    //* 게시글 조회 (페이지)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 목록', description: '제목·내용·작성자 검색, 정렬, 페이지. 고정 글은 `pinned`로 따로 준다(검색 중에는 data에 섞인다). 검색 중에는 비밀글을 빼되 내 글과 게시판 관리자는 포함한다. 볼 수 없는 비밀글은 제목이 "비밀글입니다."로 바뀐다. 게시판 정보·내 권한도 함께 준다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, 익명 게시판에서 작성자 검색' })
    @ApiNotFoundResponse({ description: '게시판이 없음, 카테고리, 또는 읽기 권한이 없음' })
    getPosts(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Query() query: PaginatePostQueryDto,
    ): Promise<PostListResponse> {
        return this.postsService.paginatePost( user, boardId, query );
    }

    //* 게시글 작성
    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 작성', description: '본문 HTML은 서버가 허용 태그만 남기도록 정제한다(영상은 YouTube·Vimeo 임베드만). 본문 이미지는 POST /common/files/images로 먼저 올리고 본문에 넣으면 서버가 찾아 연결한다. 첨부는 POST /common/files/attachments로 먼저 올리고 attachmentIds로 보낸다. 앨범 게시판은 이미지 1개 이상, 캘린더 게시판은 일정 시작·종료가 필요하다. 글 저장과 파일 연결은 한 트랜잭션이다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 앨범인데 본문 이미지 없음, 일정 시작·종료 누락, 종료가 시작보다 빠름, 고정 글 10개 초과' })
    @ApiForbiddenResponse({ description: '쓰기 권한 없음' })
    @ApiNotFoundResponse({ description: '게시판이 없음, 카테고리, 또는 읽기 권한이 없음' })
    postPost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Body() createPostDto: CreatePostDto,
    ): Promise<PostResponse> {
        return this.postsService.createPost( user, boardId, createPostDto );
    }
    
    //* 게시글 조회 (단일)
    @Get(':postId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 상세', description: '조회할 때마다 조회수가 1 오른다. 내 좋아요 여부, 첨부 목록, 버튼 표시용 권한(can)을 함께 준다. 익명 게시판의 다른 사람 글은 작성자가 가려진다.' })
    @ApiForbiddenResponse({ description: '비밀글 (작성자와 게시판 관리자만 볼 수 있다)' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    getPost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ): Promise<PostDetailResponse> {
        return this.postsService.readPost( user, boardId, postId );
    }

    //* 게시글 수정
    @Patch(':postId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 수정', description: '작성자만 수정할 수 있다(게시판 관리자도 남의 글은 수정 불가). 고정 여부는 바꾸지 않는다(PATCH .../pin). attachmentIds를 생략하면 첨부 유지, 배열이면 그 목록으로 맞춘다(빠진 파일은 삭제). 비밀글을 허용하지 않는 게시판이면 비밀글 여부는 기존 값을 유지한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 일정 시작·종료 누락, 종료가 시작보다 빠름' })
    @ApiForbiddenResponse({ description: '쓰기 권한 없음, 작성자가 아님' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    patchPost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() updatePostDto: UpdatePostDto,
    ): Promise<PostResponse> {
        return this.postsService.updatePost( user, boardId, postId, updatePostDto );
    }

    //* 게시글 고정·해제 (게시판 관리 권한)
    // ':postId' 뒤에 붙는 고정 경로라 수정 라우트와 충돌하지 않는다.
    @Patch(':postId/pin')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 고정·해제', description: '게시판 관리 권한만. 고정 글은 게시판당 최대 10개. 응답 본문은 true.' })
    @ApiBadRequestResponse({ description: '고정 글 10개 초과' })
    @ApiForbiddenResponse({ description: '게시판 관리 권한 없음' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    pinPost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Body() pinPostDto: PinPostDto,
    ): Promise<boolean> {
        return this.postsService.pinPost( user, boardId, postId, pinPostDto.isPinned );
    }

    //* 게시글 삭제
    @Delete(':postId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 삭제 (soft delete)', description: '작성자 또는 게시판 관리 권한. 연결된 파일도 함께 soft delete한다. 응답 본문은 true.' })
    @ApiForbiddenResponse({ description: '쓰기 권한 없음, 작성자·게시판 관리자가 아님' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    deletePost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ): Promise<boolean> {
        return this.postsService.deletePost( user, boardId, postId );
    }

    //* 게시글 좋아요
    @Patch(':postId/like')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '게시글 좋아요', description: '응답 본문은 true.' })
    @ApiConflictResponse({ description: '이미 좋아요를 누른 게시글' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    likePost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,

    ): Promise<boolean> {
        return this.postsService.likePost( user, boardId, postId );
    }

    //* 첨부파일 다운로드 (게시글 읽기 권한)
    // 프론트는 <a href>가 아니라 fetch(Bearer 헤더)로 받아 blob으로 저장한다.
    @Get(':postId/files/:fileId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '첨부파일 다운로드', description: '게시글 읽기 권한으로 확인한 뒤 파일을 스트리밍한다. 어떤 형식이든 브라우저가 열지 않고 내려받도록 application/octet-stream + attachment로 보낸다(한글 파일명은 RFC 5987 filename*). 프론트는 <a href>가 아니라 Bearer 헤더를 붙인 fetch로 받는다.' })
    @ApiProduces('application/octet-stream')
    @ApiOkResponse({ description: '파일 본문', schema: { type: 'string', format: 'binary' } })
    @ApiForbiddenResponse({ description: '비밀글 (작성자와 게시판 관리자만)' })
    @ApiNotFoundResponse({ description: '게시판·게시글·파일이 없음(이 글의 첨부가 아님 포함), 또는 읽기 권한이 없음' })
    async downloadFile(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, originalName, size } = await this.postsService.openAttachment( user, boardId, postId, fileId );

        // 어떤 형식이든 브라우저가 열지 않고 내려받게 한다 (업로드한 html이 우리 출처에서 실행되지 않게)
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
    @ApiOperation({ summary: '게시글 좋아요 취소', description: '응답 본문은 true.' })
    @ApiBadRequestResponse({ description: '좋아요를 누르지 않은 게시글' })
    @ApiNotFoundResponse({ description: '게시판·게시글이 없음, 또는 읽기 권한이 없음' })
    unlikePost(
        @User() user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        @Param('boardId', ParseIntPipe) boardId: number,
        @Param('postId', ParseIntPipe) postId: number,
    ): Promise<boolean> {
        return this.postsService.unlikePost( user, boardId, postId );
    }
}