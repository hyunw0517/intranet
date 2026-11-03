import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BoardType, Prisma, Users } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { BoardAuthService } from "./board-auth.service";
import { PaginatePostQueryDto, PostSortBy } from "./dto/paginate-post-query.dto";
import { PaginatePage } from "src/common/util/pagination.util";
import { BoardPermission } from "./interface/board-permission.interface";
import { CreatePostDto } from "./dto/create-post.dto";
import { OrganizationService } from "src/organization/organization.service";
import { UpdatePostDto } from "./dto/update-post.dto";
import { MAX_PINNED_POSTS } from "./const/post.const";
import { kstDayEnd, kstDayStart } from "src/common/util/date.util";
import { sanitizeEditorHtml } from "src/common/util/sanitize-html.util";

// 비밀글·익명 게시판에서 가리는 작성자 관련 필드
type AuthorField = 'author' | 'authorDepartmentName' | 'authorPositionName' | 'authorJobTitleName';

@Injectable()
export class PostsService {
    
    constructor( 
        private readonly prisma: PrismaService, 
        private readonly boardAuthService: BoardAuthService, 
        private readonly organizationService: OrganizationService,
    ){}

    async paginatePost( 
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        query: PaginatePostQueryDto 
    ) {

        // 게시판 권한 확인 (읽기 권한)
        const { board, perm } = await this.boardAuthService.assertBoardPermission( boardId, user, 'read' );
        
        // 익명 게시판은 작성자로 검색할 수 없다. (검색 결과로 누가 썼는지 알 수 있게 되므로)
        if( board.isAnonymous && query.author ){
            throw new BadRequestException('익명 게시판은 작성자로 검색할 수 없습니다.');
        }

        const hasSearch = !!( query.title || query.content || query.author );

        const where: Prisma.PostWhereInput = {
            boardId,
            deleted: false,
            title: query.title ? { contains: query.title, mode: 'insensitive' } : undefined,
            // 본문 검색은 태그를 뺀 텍스트로 한다. (HTML로 검색하면 'strong' 같은 태그 이름도 걸림)
            contentText: query.content ? { contains: query.content, mode: 'insensitive' } : undefined,
            author: query.author ? {
                OR: [
                    { name: { contains: query.author, mode: 'insensitive' } },
                    { nickname: { contains: query.author, mode: 'insensitive' } },
                ]
            } : undefined,
            // 검색 중에는 비밀글 제외 
            // - 작성자 본인 글과 게시판 관리자는 검색 결과에 포함
            OR: ( hasSearch && !perm.admin )
                ? [ { isSecret: false }, { authorId: user.id } ]
                : undefined,
            // 고정글은 pinned로 따로 내려주므로 일반 목록에서 제외 (검색 중에는 고정글도 일반 결과에 포함)
            isPinned: hasSearch ? undefined : false,
        };

        const [pinned, list] = await Promise.all([
            // 고정글: 모든 페이지 상단에 표시 (페이지네이션·정렬과 무관, 최신순)
            hasSearch ? [] : this.prisma.post.findMany({
                select: this.postListSelect(),
                where: {
                    boardId,
                    deleted: false,
                    isPinned: true,
                },
                orderBy: [
                    { createdAt: 'desc' },
                    { id: 'desc' },
                ],
            }),
            PaginatePage(
                query,
                //list
                (page) => this.prisma.post.findMany({
                    select: this.postListSelect(),
                    where,
                    orderBy: [
                        this.postOrderBy( query ),
                        { id: query.order },
                    ],
                    ...page,
                }),
                //total
                () => this.prisma.post.count({ where }),
            ),
        ]);

        // 게시판 정보·권한도 함께 내려준다. (게시판 이름, 글쓰기 버튼, 비밀글 체크박스 표시용)
        return {
            board,
            perm,
            pinned: pinned.map( row => this.maskListPost( row, user, perm, board.isAnonymous ) ),
            ...list,
            data: list.data.map( row => this.maskListPost( row, user, perm, board.isAnonymous ) ),
        };
    }

    //* 게시글 목록 select (일반 조회·정렬 조회 공용)
    private postListSelect() {
        return {
            id: true,
            title: true, 
            authorDepartmentName: true,
            authorPositionName: true,
            authorJobTitleName: true,   // 직책 (응답에는 포함, 목록 화면에서는 표시하지 않음)
            isPinned: true,
            viewCount: true,
            likeCount: true,
            isSecret: true,
            createdAt: true,
            updatedAt: true,

            // 작성자
            author: {
                select: {
                    id: true,
                    name: true,
                    nickname: true,
                }
            },
            _count: { 
                select: { 
                    comments: { 
                        where: { 
                            deleted: false, 
                        } 
                    } 
                }
            }
        } satisfies Prisma.PostSelect;
    }

    //* 게시글 상세 select (화면에 필요한 값만, 검색용 텍스트·삭제 정보 등은 제외)
    private postDetailSelect() {
        return {
            id: true,
            title: true,
            content: true,
            isPinned: true,
            isSecret: true,
            viewCount: true,
            likeCount: true,
            eventStartAt: true,
            eventEndAt: true,
            isAllDay: true,
            createdAt: true,
            updatedAt: true,

            // 작성자 + 작성(최종 수정) 당시 소속
            author: {
                select: {
                    id: true,
                    name: true,
                    nickname: true,
                }
            },
            authorDepartmentName: true,
            authorPositionName: true,
            authorJobTitleName: true,
        } satisfies Prisma.PostSelect;
    }

    //* 정렬 컬럼 -> Prisma orderBy
    private postOrderBy( query: PaginatePostQueryDto ): Prisma.PostOrderByWithRelationInput {
        switch ( query.sortBy ) {
            case PostSortBy.VIEW_COUNT:
                // 조회순
                return { viewCount: query.order };
            case PostSortBy.LIKE_COUNT:
                // 추천순
                return { likeCount: query.order };
            default:
                return { createdAt: query.order };
        }
    }

    //* 비밀글 열람 권한 조회 -> 작성자 본인 or 게시판 관리자 or 시스템 관리자(Role.ADMIN)
    // 목록 마스킹과 상세 조회가 같은 기준을 쓰도록 한 곳에 둔다.
    // 목록(author.id)과 상세(authorId)의 조회 모양이 달라 값만 받는다.
    private canViewSecret(
        isSecret: boolean,
        authorId: number,
        userId: number,
        isBoardAdmin: boolean,
    ): boolean {
        return !isSecret || isBoardAdmin || authorId === userId;
    }

    //* 작성자 정보 가리기 (작성자와 작성 당시 소속을 null로)
    // Prisma select는 행마다 다르게 고를 수 없으므로 조회 후 가린다. (프론트에서 가리면 응답에 원본이 남음)
    private hideAuthor<T extends object>( post: T ): Omit<T, AuthorField> & Record<AuthorField, null> {
        return {
            ...post,
            author: null,
            authorDepartmentName: null,
            authorPositionName: null,
            authorJobTitleName: null,
        };
    }

    //* 익명 게시판: 본인 글이 아니면 작성자를 가린다. (게시판 관리자·시스템 관리자도 볼 수 없음)
    // 정말 필요한 경우에는 개발자가 DB에서 직접 확인한다.
    private isAuthorHidden(
        isAnonymous: boolean,
        authorId: number,
        userId: number,
    ): boolean {
        return isAnonymous && authorId !== userId;
    }

    //* 목록 항목 가리기
    // - 볼 수 없는 비밀글: 제목·작성자 정보를 가린다.
    // - 익명 게시판의 다른 사람 글: 작성자 정보만 가린다.
    private maskListPost<T extends { isSecret: boolean; author: { id: number } }>(
        post: T,
        user: Pick<Users, 'id'>,
        perm: BoardPermission,
        isAnonymous: boolean,
    ) {
        if( !this.canViewSecret( post.isSecret, post.author.id, user.id, perm.admin ) ){
            return { ...this.hideAuthor( post ), title: "비밀글입니다." };
        }

        if( this.isAuthorHidden( isAnonymous, post.author.id, user.id ) ){
            return this.hideAuthor( post );
        }

        return post;
    }

    //* 게시글 작성
    async createPost(
        user: Pick<Users, 'id' | 'role'>,
        boardId: number,
        body: CreatePostDto
    ) {
        // 게시판 권한 확인 (쓰기 권한)
        const { board, perm } = await this.boardAuthService.assertBoardPermission( boardId, user, 'write' );

        // 고정은 게시판 관리 권한만 가능. 권한이 없으면 요청 값을 무시하고 false로 저장
        const isPinned = perm.admin && ( body.isPinned ?? false );
        if( isPinned ){
            await this.assertPinLimit( boardId );
        }

        // 작성자 대표 소속/직급
        const author = await this.organizationService.getPrimaryOrganizationNames( user.id );

        // INSERT
        return await this.prisma.post.create({
            data: {
                boardId,
                authorId: user.id,
                authorPositionName: author.positionName,
                authorDepartmentName: author.departmentName,
                authorJobTitleName: author.jobTitleName,
                title: body.title,
                ...this.toContentFields( body.content ),
                isPinned,
                // 비밀글을 허용하지 않는 게시판이면 요청 값을 무시하고 false로 저장
                isSecret: board.allowSecret && ( body.isSecret ?? false ),
                ...this.resolveEventFields( board.type, body ),
                createdId: user.id,
                updatedId: user.id,
            },
        });

    }

    //* 게시글 단일 조회
    async readPost(
        user: Pick<Users, 'id' | 'role'>,
        boardId: number,
        postId: number
    ) {

        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        const { post: found, board, perm } = await this.checkPost(boardId, postId, user, 'read');

        // 조회수 증가 (update 결과 = 증가된 조회수가 반영된 게시글)
        const [post] = await this.prisma.$transaction([
            this.prisma.post.update({
                select: this.postDetailSelect(),
                where: { id: postId },
                data: { viewCount: { increment: 1 } },
            }),
            // 유저가 해당 게시글을 조회했는지 기록 (중복X)
            this.prisma.postView.createMany({
                data: { postId, userId: user.id },
                skipDuplicates: true,   // 중복 방지 옵션
            }),
        ]);

        // 버튼 표시용 권한 (서버 판정 결과, 실제로 막는 것은 각 API의 검사)
        const isAuthor = found.authorId === user.id;
        const can = {
            edit: isAuthor && perm.write,       // 수정: 작성자 + 쓰기 권한 (관리자도 남의 글은 수정 불가)
            delete: isAuthor || perm.admin,     // 삭제: 작성자 또는 게시판 관리 권한
            pin: perm.admin,                    // 고정: 게시판 관리 권한
            comment: perm.comment,
        };

        // 익명 게시판의 다른 사람 글은 작성자 정보를 가린다.
        const detail = this.isAuthorHidden( board.isAnonymous, found.authorId, user.id )
            ? this.hideAuthor( post )
            : post;

        return {
            ...detail,
            board,
            can,
        };
    }

    //* 게시글 수정
    async updatePost(
        user: Pick<Users, 'id' | 'role'>,
        boardId: number,
        postId: number,
        body: UpdatePostDto
    ) {
        const { board } = await this.checkPost(boardId, postId, user, 'update');
        
        // 작성자 대표 소속/직급
        const author = await this.organizationService.getPrimaryOrganizationNames( user.id );

        return await this.prisma.post.update({
            where: {
                id: postId,
            },
            data: {
                authorId: user.id,
                authorPositionName: author.positionName,
                authorDepartmentName: author.departmentName,
                authorJobTitleName: author.jobTitleName,
                title: body.title,
                ...this.toContentFields( body.content ),
                // 고정 여부는 별도 API(pinPost)에서만 바꾼다. (작성자 수정으로 관리자가 고정한 글이 풀리지 않게)
                // 비밀글을 허용하지 않는 게시판이면 기존 값 유지 (허용 → 비허용으로 바뀐 게시판의 기존 비밀글이 공개되지 않게)
                isSecret: board.allowSecret ? ( body.isSecret ?? false ) : undefined,
                ...this.resolveEventFields( board.type, body ),
                updatedId: user.id,
            },
        });
    }

    //* 게시글 삭제
    async deletePost(
        user: Pick<Users, 'id' | 'role'>,
        boardId: number,
        postId: number,
    ) {
        await this.checkPost(boardId, postId, user, 'delete');

        await this.prisma.post.update({
            where: { 
                id: postId
            },
            data: { 
                deleted: true,
                deletedAt: new Date(),
                deletedId: user.id,
            },
        });

        return true;
    }

    //* 본문 정제 (작성·수정 공용) → 저장용 HTML + 검색용 텍스트
    // 허용 목록 외의 태그·속성은 제거하고, 정제 후 내용이 없으면 null로 저장한다.
    private toContentFields(
        content: string | null | undefined,
    ){
        const { html, text } = sanitizeEditorHtml( content );

        return { content: html, contentText: text };
    }

    //* 일정 필드 정리 (작성·수정 공용)
    // - 캘린더가 아닌 게시판: 일정 값을 무시하고 null (화면에서도 일정 입력을 숨김)
    // - 캘린더 게시판: 시작·종료 필수, 종일이면 KST 00:00:00 ~ 23:59:59로 맞춘 뒤 종료 ≥ 시작 확인
    //   (종일 일정은 화면에서 시간 입력을 숨기므로 어떤 시간이 와도 그날 경계로 맞춘다)
    private resolveEventFields(
        boardType: BoardType,
        body: Pick<CreatePostDto, 'eventStartAt' | 'eventEndAt' | 'isAllDay'>,
    ){
        if( boardType !== BoardType.CALENDAR ){
            return { eventStartAt: null, eventEndAt: null, isAllDay: null };
        }

        if( !body.eventStartAt || !body.eventEndAt ){
            throw new BadRequestException('일정의 시작일시와 종료일시를 입력하세요.');
        }

        const isAllDay = body.isAllDay ?? false;
        const eventStartAt = isAllDay ? kstDayStart( body.eventStartAt ) : body.eventStartAt;
        const eventEndAt = isAllDay ? kstDayEnd( body.eventEndAt ) : body.eventEndAt;

        // 종일 경계를 맞춘 뒤 비교한다. (같은 날 10시 시작·9시 종료로 온 종일 일정은 정상)
        if( eventEndAt < eventStartAt ){
            throw new BadRequestException('종료일시는 시작일시보다 빠를 수 없습니다.');
        }

        return { eventStartAt, eventEndAt, isAllDay };
    }

    //* 게시글 고정·해제 (게시판 관리 권한, 작성자 여부 무관)
    async pinPost(
        user: Pick<Users, 'id' | 'role'>,
        boardId: number,
        postId: number,
        isPinned: boolean,
    ) {
        // 고정은 글쓰기가 아닌 관리 동작이라 읽기로 확인하고 관리 권한을 따로 본다.
        const { post, perm } = await this.checkPost(boardId, postId, user, 'read');

        if( !perm.admin ){
            throw new ForbiddenException('게시판 관리자만 게시글을 고정할 수 있습니다.');
        }

        // 이미 같은 상태면 변경 없음 (고정된 글을 다시 고정해도 개수 제한에 걸리지 않게)
        if( post.isPinned === isPinned ){
            return true;
        }

        if( isPinned ){
            await this.assertPinLimit( boardId );
        }

        await this.prisma.post.update({
            where: { id: postId },
            data: {
                isPinned,
                updatedId: user.id,
            },
        });

        return true;
    }

    //* 고정 글 개수 제한 (게시판당 MAX_PINNED_POSTS개)
    // 동시에 고정하면 초과될 수 있으나, 관리자가 동시에 고정할 일이 드물어 허용한다.
    private async assertPinLimit(
        boardId: number,
    ){
        const pinnedCount = await this.prisma.post.count({
            where: {
                boardId,
                deleted: false,
                isPinned: true,
            },
        });

        if( pinnedCount >= MAX_PINNED_POSTS ){
            throw new BadRequestException(`고정 글은 최대 ${MAX_PINNED_POSTS}개까지 지정할 수 있습니다.`);
        }
    }

    //* 게시글 존재 확인 + 권한 확인
    // 게시글과 함께 게시판 정보·권한을 반환한다. (상세 응답의 버튼 표시, 고정 권한 확인 등에 이어서 사용)
    async checkPost(
        boardId: number,
        postId: number,
        user: Pick<Users, 'id' | 'role'>,
        action: 'read' | 'update' | 'delete' | 'comment',
    ){
        const actionByType = { read: 'read', update: 'write', delete: 'write', comment: 'comment' } as const;

        // 게시판 권한 확인 
        const { board, perm } = await this.boardAuthService.assertBoardPermission( boardId, user, actionByType[action] );

        const post = await this.prisma.post.findFirst({
            where: { 
                id: postId, 
                boardId, 
                deleted: false,  
            },
        });

        if( !post ){
            throw new NotFoundException('게시글을 찾을 수 없습니다.');
        } 
        
        // 비밀글: 작성자 또는 게시판 관리 권한
        if( !this.canViewSecret( post.isSecret, post.authorId, user.id, perm.admin ) ){
            throw new ForbiddenException('비밀글은 작성자와 관리자만 볼 수 있습니다.');
        }

        switch( action ){
            case 'update':
                if( user.id !== post.authorId ){
                    throw new ForbiddenException('게시글 작성자만 수정할 수 있습니다.');
                }
            break;
            case 'delete':
                if( user.id !== post.authorId && !perm.admin ){
                    throw new ForbiddenException('게시글 작성자만 삭제할 수 있습니다.');
                }
            break;
        }

        return { post, board, perm };
    }

}