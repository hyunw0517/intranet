import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, BoardType, FileTargetType, Prisma, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { BoardNotifier } from "./board-notifier";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PrismaService } from "src/prisma/prisma.service";
import { BoardAuthService } from "./board-auth.service";
import { PaginatePostQueryDto, PostSortBy } from "./dto/paginate-post-query.dto";
import { PaginatePage } from "src/common/util/pagination.util";
import { BoardPermission } from "./interface/board-permission.interface";
import { CreatePostDto } from "./dto/create-post.dto";
import { OrganizationService } from "src/organization/organization.service";
import { UpdatePostDto } from "./dto/update-post.dto";
import { MAX_CALENDAR_RANGE_DAYS, MAX_PINNED_POSTS, RECENT_NOTICE_COUNT } from "./const/post.const";
import { kstDayEnd, kstDayStart } from "src/common/util/date.util";
import { extractImageNames, sanitizeEditorHtml } from "src/common/util/sanitize-html.util";
import { FileInfo, FilesService } from "src/common/files.service";
import { FileKind } from "src/common/const/file.const";

// 비밀글·익명 게시판에서 가리는 작성자 관련 필드
type AuthorField = 'author' | 'authorDepartmentName' | 'authorPositionName' | 'authorJobTitleName';

@Injectable()
export class PostsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly boardAuthService: BoardAuthService,
        private readonly organizationService: OrganizationService,
        private readonly filesService: FilesService,
        auditService: AuditService,
        private readonly boardNotifier: BoardNotifier,
    ){
        this.audit = auditService.target( AuditTargetType.POST );
    }

    async paginatePost( 
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>, 
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

        // 앨범 게시판: 대표 이미지(본문 첫 이미지) 썸네일과 이미지 수
        // 볼 수 없는 비밀글은 제목처럼 이것도 내려주지 않는다.
        let thumbnails: Map<number, FileInfo> | null = null;
        let imageCounts: Map<number, number> | null = null;
        if ( board.type === BoardType.ALBUM ) {
            const viewableIds = [ ...pinned, ...list.data ]
                .filter( row => this.canViewSecret( row.isSecret, row.author.id, user.id, perm.admin ) )
                .map( row => row.id );

            [ thumbnails, imageCounts ] = await Promise.all([
                this.filesService.findFirstByTargets( FileTargetType.POST_IMAGE, viewableIds ),
                this.filesService.countByTargets( FileTargetType.POST_IMAGE, viewableIds ),
            ]);
        }

        const toItem = ( row: ( typeof list.data )[number] ) => ({
            ...this.maskListPost( row, user, perm, board.isAnonymous ),
            thumbnailUrl: thumbnails?.get( row.id )?.thumbnailUrl ?? null,
            imageCount: imageCounts?.get( row.id ) ?? 0,    // 앨범이 아니거나 볼 수 없는 비밀글은 0
        });

        // 게시판 정보·권한도 같이 준다 (게시판 이름, 글쓰기 버튼, 비밀글 체크박스)
        return {
            board,
            perm,
            pinned: pinned.map( toItem ),
            ...list,
            data: list.data.map( toItem ),
        };
    }

    //* 최근 공지 (대시보드): 읽을 수 있는 공지 게시판의 최신 글
    // 비밀글은 제외하고, 익명 게시판의 작성자가 드러나지 않도록 작성자는 내려주지 않는다.
    async findRecentNotices( user: Pick<Users, 'id' | 'role' | 'adminPermissions'> ){
        const navigation = await this.boardAuthService.getUserBoardNavigate( user );
        const boardIds = navigation.filter( ( b ) => b.type === BoardType.NOTICE ).map( ( b ) => b.id );

        if( boardIds.length === 0 ){
            return [];
        }

        return this.prisma.post.findMany({
            select: {
                id: true,
                boardId: true,
                title: true,
                isPinned: true,
                createdAt: true,
                board: { select: { name: true } },
            },
            where: { boardId: { in: boardIds }, deleted: false, isSecret: false },
            orderBy: [ { createdAt: 'desc' }, { id: 'desc' } ],
            take: RECENT_NOTICE_COUNT,
        });
    }

    //* 캘린더 일정 조회 (통합 / 게시판 하나)
    // - 기간과 겹치는 일정은 모두 가져온다 (eventStartAt < end && eventEndAt >= start)
    // - 비밀글 일정은 작성자 본인만 본다. 관리자도 달력에서는 못 본다.
    // - 익명 캘린더는 본인 일정이 아니면 작성자를 가린다.
    async findCalendarEvents(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        target: { boardId: number } | { boardIds: number[] | null },
        start: Date,
        end: Date,
    ){
        if( end <= start ){
            throw new BadRequestException('조회 종료일시는 시작일시보다 뒤여야 합니다.');
        }
        // 달력 한 화면(최대 6주) + 여유. 범위 제한 없이 열어 두면 한 번에 모든 일정을 읽을 수 있다.
        if( end.getTime() - start.getTime() > MAX_CALENDAR_RANGE_DAYS * 24 * 60 * 60 * 1000 ){
            throw new BadRequestException(`일정은 한 번에 ${MAX_CALENDAR_RANGE_DAYS}일까지 조회할 수 있습니다.`);
        }

        const boards = await this.resolveCalendarBoards( user, target );
        if( boards.length === 0 ){
            return { boards: [], showLeaves: false, events: [] };
        }
        const anonymousIds = new Set( boards.filter( b => b.isAnonymous ).map( b => b.id ) );

        const rows = await this.prisma.post.findMany({
            select: {
                id: true,
                boardId: true,
                title: true,
                eventStartAt: true,
                eventEndAt: true,
                isAllDay: true,
                eventColor: true,
                isSecret: true,
                author: { select: { id: true, name: true, nickname: true } },
            },
            where: {
                boardId: { in: boards.map( b => b.id ) },
                deleted: false,
                eventStartAt: { lt: end },
                eventEndAt: { gte: start },
                OR: [ { isSecret: false }, { authorId: user.id } ],
            },
            orderBy: [ { eventStartAt: 'asc' }, { id: 'asc' } ],
        });

        return {
            boards: boards.map( ( { id, name, showLeaves } ) => ({ id, name, showLeaves }) ),
            // 보고 있는 게시판 중 하나라도 휴가자 표시가 켜져 있으면 true
            showLeaves: boards.some( ( b ) => b.showLeaves ),
            events: rows.map( ( row ) => ({
                ...row,
                author: this.isAuthorHidden( anonymousIds.has( row.boardId ), row.author.id, user.id ) ? null : row.author,
            }) ),
        };
    }

    //* 일정을 조회할 캘린더 게시판 (id·이름·익명 여부)
    private async resolveCalendarBoards(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        target: { boardId: number } | { boardIds: number[] | null },
    ){
        if( 'boardId' in target ){
            const { board } = await this.boardAuthService.assertBoardPermission( target.boardId, user, 'read' );
            if( board.type !== BoardType.CALENDAR ){
                throw new BadRequestException('캘린더 게시판이 아닙니다.');
            }
            return [ { id: board.id, name: board.name, isAnonymous: board.isAnonymous, showLeaves: board.showLeaves } ];
        }

        // 읽기 권한 판정은 내비게이션과 같은 로직을 쓴다. (메뉴에 보이는 캘린더 = 일정을 볼 수 있는 캘린더)
        const navigation = await this.boardAuthService.getUserBoardNavigate( user );
        const requested = target.boardIds ? new Set( target.boardIds ) : null;
        const ids = navigation
            .filter( ( b ) => b.type === BoardType.CALENDAR && ( !requested || requested.has( b.id ) ) )
            .map( ( b ) => b.id );

        if( ids.length === 0 ){
            return [];
        }

        return this.prisma.board.findMany({
            select: { id: true, name: true, isAnonymous: true, showLeaves: true },
            where: { id: { in: ids }, deleted: false },
            orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
        });
    }

    //* 게시글 목록 select (일반 조회·정렬 조회 공용)
    private postListSelect() {
        return {
            id: true,
            title: true, 
            authorDepartmentName: true,
            authorPositionName: true,
            authorJobTitleName: true,   // 목록 화면에는 안 보인다
            isPinned: true,
            viewCount: true,
            likeCount: true,
            eventStartAt: true,
            eventEndAt: true,
            isAllDay: true,
            eventColor: true,
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

    //* 게시글 상세 select (화면에 필요한 값만)
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
            eventColor: true,
            createdAt: true,
            updatedAt: true,
            editedAt: true,

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

    //* 비밀글 열람 권한 조회 -> 작성자 본인 or 게시판 관리자 or 시스템 관리자
    // 목록 가리기와 상세 조회가 같은 기준을 쓰도록 한 곳에 둔다.
    private canViewSecret(
        isSecret: boolean,
        authorId: number,
        userId: number,
        isBoardAdmin: boolean,
    ): boolean {
        return !isSecret || isBoardAdmin || authorId === userId;
    }

    //* 작성자 정보 가리기 (작성자와 작성 당시 소속을 null로)
    // select는 행마다 다르게 고를 수 없어서 조회 후 가린다 (프론트에서 가리면 응답에 원본이 남는다)
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
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
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

        // 본문 정제 + 본문 이미지 id
        const { imageIds, ...contentFields } = await this.toContentFields( body.content, user.id, null );

        // 앨범 게시판은 작성할 때 이미지가 1개 이상 있어야 한다
        if( board.type === BoardType.ALBUM && imageIds.length === 0 ){
            throw new BadRequestException('앨범 게시판은 본문에 이미지를 1개 이상 넣어야 합니다.');
        }

        // 글 저장과 파일 연결을 한 트랜잭션으로 (파일 연결이 실패하면 글도 저장하지 않는다)
        const post = await this.prisma.$transaction( async ( tx ) => {
            const post = await tx.post.create({
                data: {
                    boardId,
                    authorId: user.id,
                    authorPositionName: author.positionName,
                    authorDepartmentName: author.departmentName,
                    authorJobTitleName: author.jobTitleName,
                    title: body.title,
                    ...contentFields,
                    isPinned,
                    // 비밀글을 허용하지 않는 게시판이면 요청 값을 무시하고 false로 저장
                    isSecret: board.allowSecret && ( body.isSecret ?? false ),
                    ...this.resolveEventFields( board.type, body ),
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.syncPostFiles( tx, post.id, user.id, imageIds, body.attachmentIds ?? [] );

            await this.audit.created( tx, post.id, `게시글 작성: ${post.title}`, {
                boardId,
                isPinned: post.isPinned,
                isSecret: post.isSecret,
                imageIds,
                attachmentIds: body.attachmentIds ?? [],
            });

            return post;
        });

        // 커밋 후 공지 알림 (작성할 때만, 실패해도 글 작성은 성공)
        if( board.type === BoardType.NOTICE ){
            await this.boardNotifier.noticeCreated({ board, post, writerId: user.id });
        }

        return post;
    }

    //* 게시글 단일 조회
    async readPost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number
    ) {

        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        const { board, perm } = await this.checkPost(boardId, postId, user, 'read');

        // 조회수 증가 (update 결과 = 증가된 조회수가 반영된 게시글) + 좋아요 여부
        const [post, , myLike] = await this.prisma.$transaction([
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
            this.prisma.postLike.findUnique({
                select: { postId: true },
                where: { postId_userId: { postId, userId: user.id } },
            }),
        ]);

        // 첨부파일 목록 (본문 이미지는 본문 HTML에 들어 있으므로 제외)
        const files = await this.filesService.listByTarget( FileTargetType.POST, postId );

        // 버튼 표시용 권한 (실제 차단은 각 API가 한다)
        const isAuthor = post.author.id === user.id;
        const can = {
            edit: isAuthor && perm.write,       // 수정: 작성자 + 쓰기 권한 (관리자도 남의 글은 수정 불가)
            delete: isAuthor || perm.admin,     // 삭제: 작성자 또는 게시판 관리 권한
            pin: perm.admin,                    // 고정: 게시판 관리 권한
            comment: perm.comment,
        };

        // 익명 게시판의 다른 사람 글은 작성자 정보를 가린다.
        const detail = this.isAuthorHidden( board.isAnonymous, post.author.id, user.id )
            ? this.hideAuthor( post )
            : post;

        return {
            ...detail,
            liked: myLike !== null,     // 내가 좋아요를 눌렀는지
            files,                      // 첨부파일
            board,
            can,
        };
    }

    //* 게시글 수정
    async updatePost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number,
        body: UpdatePostDto
    ) {
        const { board, post: before } = await this.checkPost(boardId, postId, user, 'update');

        // 작성자 대표 소속/직급
        const author = await this.organizationService.getPrimaryOrganizationNames( user.id );

        // 본문 정제 + 본문 이미지 id (이 글에 이미 연결된 이미지도 유지 대상)
        const { imageIds, ...contentFields } = await this.toContentFields( body.content, user.id, postId );

        return await this.prisma.$transaction( async ( tx ) => {
            // 감사 로그 비교 대상 (본문 HTML은 크므로 바뀌었는지만 남긴다)
            const changedFields = {
                title: body.title,
                // 고정 여부는 pinPost에서만 바꾼다 (작성자 수정으로 고정이 풀리지 않게)
                // 비밀글 비허용 게시판이면 기존 값 유지 (허용에서 바뀐 게시판의 비밀글이 공개되지 않게)
                isSecret: board.allowSecret ? ( body.isSecret ?? false ) : undefined,
                ...this.resolveEventFields( board.type, body ),
            };

            const post = await tx.post.update({
                where: {
                    id: postId,
                },
                data: {
                    authorId: user.id,
                    authorPositionName: author.positionName,
                    authorDepartmentName: author.departmentName,
                    authorJobTitleName: author.jobTitleName,
                    ...contentFields,
                    ...changedFields,
                    updatedId: user.id,
                    editedAt: new Date(),
                },
            });

            // 첨부는 attachmentIds를 보냈을 때만 맞춘다. (안 보내면 기존 첨부 유지)
            await this.syncPostFiles( tx, postId, user.id, imageIds, body.attachmentIds );

            await this.audit.updated( tx, postId, `게시글 수정: ${post.title}`, diffChanges( before, changedFields ), {
                boardId,
                contentChanged: before.content !== contentFields.content,
                imageIds,
                ...( body.attachmentIds !== undefined && { attachmentIds: body.attachmentIds } ),
            });

            return post;
        });
    }

    //* 게시글 삭제
    async deletePost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number,
    ) {
        const { post, board } = await this.checkPost(boardId, postId, user, 'delete');

        // 글과 연결 파일(첨부·본문 이미지)을 함께 soft delete (실제 파일은 남겨 둔다)
        await this.prisma.$transaction( async ( tx ) => {
            await tx.post.update({
                where: {
                    id: postId
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            });

            await this.filesService.softDeleteByTarget( tx, [ FileTargetType.POST, FileTargetType.POST_IMAGE ], postId, user.id );

            // 관리 권한으로 남의 글을 지운 경우를 구분
            await this.audit.deleted( tx, postId, `게시글 삭제${ post.authorId !== user.id ? '(관리자)' : '' }: ${post.title}`,
                { boardId, authorId: post.authorId } );

        });

        // 커밋 후: 남의 글이면 작성자에게 알림 (본인 삭제는 BoardNotifier가 거른다)
        await this.boardNotifier.postDeletedByAdmin({ board, post, deleterId: user.id });

        return true;
    }

    //* 첨부파일 다운로드 (게시글 읽기 권한 확인 후 스트림)
    async openAttachment(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number,
        fileId: number,
    ) {
        await this.checkPost( boardId, postId, user, 'read' );

        return this.filesService.openTargetFile( fileId, FileTargetType.POST, postId );
    }

    //* 본문 정제 (작성·수정 공용)
    // 본문 이미지는 내가 올린 미연결 이미지와 이 글에 이미 연결된 이미지만 남긴다.
    // 다른 글의 이미지 주소를 붙여 넣으면 그 글이 지워질 때 같이 깨지기 때문이다.
    private async toContentFields(
        content: string | null | undefined,
        userId: number,
        postId: number | null,
    ){
        const first = sanitizeEditorHtml( content );
        const names = extractImageNames( first.html );
        const usable = await this.filesService.findUsableImages( names, userId, FileTargetType.POST_IMAGE, postId );

        // 쓸 수 없는 이미지가 있을 때만 한 번 더 정제해 제거한다.
        const { html, text } = usable.size === names.length
            ? first
            : sanitizeEditorHtml( first.html, { allowImage: ( name ) => usable.has( name ) } );

        // 본문 순서 = 이미지 순서 (앨범 대표 이미지는 첫 번째 이미지)
        const imageIds = extractImageNames( html ).map( ( name ) => usable.get( name )! );

        return { content: html, contentText: text, imageIds };
    }

    //* 게시글 파일 연결 (작성·수정 공용, 트랜잭션 안에서)
    // - 본문 이미지: 항상 본문 기준으로 맞춘다. (본문에서 지운 이미지는 삭제)
    // - 첨부: attachmentIds가 undefined면 건드리지 않는다.
    private async syncPostFiles(
        tx: Prisma.TransactionClient,
        postId: number,
        userId: number,
        imageIds: number[],
        attachmentIds: number[] | undefined,
    ){
        await this.filesService.syncTargetFiles( tx, {
            kind: FileKind.IMAGE,
            targetType: FileTargetType.POST_IMAGE,
            targetId: postId,
            fileIds: imageIds,
            userId,
        });

        if ( attachmentIds !== undefined ) {
            await this.filesService.syncTargetFiles( tx, {
                kind: FileKind.ATTACHMENT,
                targetType: FileTargetType.POST,
                targetId: postId,
                fileIds: attachmentIds,
                userId,
            });
        }
    }

    //* 일정 필드 정리 (작성·수정 공용)
    // - 캘린더가 아닌 게시판은 일정 값을 null로
    // - 캘린더 게시판은 시작·종료 필수, 종일이면 KST 00:00:00 ~ 23:59:59로 맞춘 뒤 비교
    private resolveEventFields(
        boardType: BoardType,
        body: Pick<CreatePostDto, 'eventStartAt' | 'eventEndAt' | 'isAllDay' | 'eventColor'>,
    ){
        if( boardType !== BoardType.CALENDAR ){
            return { eventStartAt: null, eventEndAt: null, isAllDay: null, eventColor: null };
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

        // 일정 색: 정해진 색 중 작성자가 선택, null = 기본색.
        // 생략하면 작성은 기본색, 수정은 기존 색 유지 (Prisma가 undefined 필드를 건드리지 않음)
        return { eventStartAt, eventEndAt, isAllDay, eventColor: body.eventColor };
    }

    //* 게시글 고정·해제 (게시판 관리 권한, 작성자 여부 무관)
    async pinPost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
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

        await this.prisma.$transaction( async ( tx ) => {
            await tx.post.update({
                where: { id: postId },
                data: {
                    isPinned,
                    updatedId: user.id,
                },
            });

            await this.audit.updated( tx, postId, `게시글 ${ isPinned ? '고정' : '고정 해제' }: ${post.title}`,
                { isPinned: { before: post.isPinned, after: isPinned } }, { boardId } );
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

    //* 게시글 좋아요
    async likePost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number,
    ) {
        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        await this.checkPost(boardId, postId, user, 'read');

        // 좋아요 중복 확인
        const likePost = await this.prisma.postLike.findFirst({
            where: {
                postId,
                userId: user.id,
            },
        });

        if( likePost ){
            throw new ConflictException('이미 좋아요를 누른 게시글입니다.');
        }

        await this.prisma.$transaction([
            this.prisma.postLike.create({
                data: {
                    postId,
                    userId: user.id,
                },
            }),
            this.prisma.post.update({
                where: { id: postId },
                data: { likeCount: { increment: 1 } },
            }),
        ]);

        return true;
    }

    //* 게시글 좋아요 취소
    async unlikePost(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        boardId: number,
        postId: number,
    ) {
        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        await this.checkPost(boardId, postId, user, 'read');

        // 좋아요 존재 확인
        const likePost = await this.prisma.postLike.findFirst({
            where: {
                postId,
                userId: user.id,
            },
        });

        if( !likePost ){
            throw new BadRequestException('좋아요를 누르지 않은 게시글입니다.');
        }

        await this.prisma.$transaction([
            this.prisma.postLike.delete({
                where: {
                    postId_userId: {
                        postId,
                        userId: user.id,
                    },
                },
            }),
            this.prisma.post.update({
                where: { id: postId },
                data: { likeCount: { decrement: 1 } },
            }),
        ]);

        return true;
    }        

    //* 게시글 존재 확인 + 권한 확인
    // 게시판 정보·권한도 같이 돌려준다 (버튼 표시, 고정 권한 확인 등)
    async checkPost(
        boardId: number,
        postId: number,
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
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