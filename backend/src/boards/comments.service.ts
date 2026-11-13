import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { BoardAuthService } from "./board-auth.service";
import { OrganizationService } from "src/organization/organization.service";
import { PostsService } from "./posts.service";
import { AuditTargetType, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UpdateCommentDto } from "./dto/update-comment.dto";
import { toTreeList } from "src/common/util/tree.util";
import { BoardNotifier } from "./board-notifier";

@Injectable()
export class CommentsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly boardAuthService: BoardAuthService,
        private readonly postsService: PostsService,
        private readonly organizationService: OrganizationService,
        auditService: AuditService,
        private readonly boardNotifier: BoardNotifier,
    ){
        this.audit = auditService.target( AuditTargetType.COMMENT );
    }

    //* 댓글 조회
    async paginateComment(
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        postId: number
    ) {

        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        // -> 댓글 권한이 없어도 읽기 권한이 있으면 조회 가능
        const { board, perm } = await this.postsService.checkPost(boardId, postId, user, 'read');

        // 게시글 전체 조회 (삭제 포함->삭제된 부모 댓글 확인용)
        const comments = await this.prisma.comment.findMany({
            select: {
                id: true,
                parentCommentId: true,
                comment: true,
                author: {
                    select: {
                        id: true,
                        name: true,
                        nickname: true,
                    },
                },
                authorDepartmentName: true, 
                authorPositionName: true, 
                authorJobTitleName: true, 
                createdAt: true, 
                updatedAt: true, 
                deleted: true,
            },
            where: {
                postId
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        // 2-1. 답글이 없는 삭제 댓글은 리스트에서 제외. 
        // 살아 있는 댓글에서 위로 올라가며 부모(삭제된 댓글 포함)을 모두 남길 대상으로 표시.
        const parentOf = new Map( comments.map( ( c ) => [ c.id, c.parentCommentId ] ) );
        const keepIds = new Set<number>();

        for( const c of comments ){
            if( c.deleted ) continue;

            let id: number | null = c.id;

            // 이미 표시된 댓글을 만나면 그 위는 앞에서 처리했으므로 정지.
            while( id !== null && !keepIds.has( id ) ){
                keepIds.add( id );
                id = parentOf.get( id ) ?? null;
            }
        }

        const visibleComments = comments.filter( ( c ) => keepIds.has( c.id ) );

        // 트리 순서 정렬 -> 전위 순회 (기준: createdAt)
        const tree = toTreeList(
            visibleComments,
            ( c ) => c.parentCommentId,
            ( a, b ) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id,
        );
        
        // 행마다 가리기·권한        삭제 댓글 → 내용·작성자 제거 / 익명 → 본인 아니면 작성자 제거 / can 계산
        return tree.map( ( c ) => {
            const isAuthor = c.author.id === user.id;

            // 삭제된 댓글: 자리만 남기고 내용·작성자는 응답에서 제외 (화면: 회색 "(삭제된 댓글입니다)")
            if( c.deleted ){
                return {
                    id: c.id, 
                    parentCommentId: c.parentCommentId, 
                    depth: c.depth,
                    deleted: true, 
                    comment: null, 
                    author: null,
                    authorDepartmentName: null, 
                    authorPositionName: null, 
                    authorJobTitleName: null,
                    createdAt: c.createdAt, 
                    updatedAt: c.updatedAt,
                    can: { 
                        edit: false, 
                        delete: false 
                    },
                };
            }

            const can = {
                edit: isAuthor && perm.comment,       // 수정: 작성자 + 댓글 권한
                delete: ( isAuthor && perm.comment ) || perm.admin,   // 삭제: 작성자 또는 관리자
            };

            // 익명 게시판: 본인 댓글이 아니면 작성자 정보를 가림 (관리자도 볼 수 없음)
            if( board.isAnonymous && !isAuthor ){
                return { ...c, author: null, authorDepartmentName: null, authorPositionName: null, authorJobTitleName: null, can };
            }

            return { ...c, can };
        });
    }

    //* 댓글 작성
    async createComment(
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        postId: number, 
        body: CreateCommentDto
    ) {

        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        const { post, board } = await this.postsService.checkPost(boardId, postId, user, 'comment');

        const parentComment = body.parentCommentId
            ? await this.prisma.comment.findFirst({
                where: {
                    id: body.parentCommentId,
                    postId,
                    deleted: false,
                },
            })
            : null;

        if( body.parentCommentId && !parentComment ){
            throw new BadRequestException('원본 댓글을 찾을 수 없습니다.');
        }
        
        // 작성자 대표 소속/직급
        const author = await this.organizationService.getPrimaryOrganizationNames( user.id );
        
        // 댓글 내용 공백만 있는지 확인
        if( body.comment.trim() === "" ){
            throw new BadRequestException('댓글 내용을 입력해 주세요.');
        }

        const newComment = await this.prisma.$transaction( async (tx) => {
            const newComment = await tx.comment.create({
                data: {
                    postId,
                    parentCommentId: body.parentCommentId ?? null,
                    authorId: user.id,
                    authorDepartmentName: author.departmentName,
                    authorJobTitleName: author.jobTitleName,
                    authorPositionName: author.positionName,
                    comment: body.comment,
                    createdId: user.id,
                    updatedId: user.id,
                }
            });

            await this.audit.created( tx, newComment.id, '댓글 작성', { boardId, postId, parentCommentId: newComment.parentCommentId } );

            return newComment;
        });

        // 커밋 후: 글 작성자·부모 댓글 작성자에게 알림 (규칙은 BoardNotifier, 실패해도 댓글 작성은 성공)
        await this.boardNotifier.newComment({
            boardId,
            post,
            isAnonymous: board.isAnonymous,
            parentAuthorId: parentComment?.authorId ?? null,
            commentId: newComment.id,
            comment: body.comment,
            writerId: user.id,
        });

        return newComment;
    }

    //* 댓글 수정
    async updateComment(
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        postId: number, 
        commentId: number,
        body: UpdateCommentDto
    ) {
        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        const { comment: before } = await this.checkComment(boardId, postId, commentId, user, 'update');

        // 작성자 대표 소속/직급
        const author = await this.organizationService.getPrimaryOrganizationNames( user.id );

        // 댓글 내용 공백만 있는지 확인
        if( body.comment.trim() === "" ){
            throw new BadRequestException('댓글 내용을 입력해 주세요.');
        }

        return await this.prisma.$transaction( async (tx) => {
            const updatedComment = await tx.comment.update({
                where: {
                    id: commentId,
                },
                data: {
                    authorId: user.id,
                    authorDepartmentName: author.departmentName,
                    authorJobTitleName: author.jobTitleName,
                    authorPositionName: author.positionName,
                    comment: body.comment,
                    updatedId: user.id,
                }
            });

            // 댓글은 짧으므로 내용 전후를 남긴다. (게시글 본문은 크기 때문에 바뀌었는지만 남김)
            await this.audit.updated( tx, commentId, '댓글 수정', diffChanges( before, { comment: body.comment } ), { boardId, postId } );

            return updatedComment;
        });
    }

    //* 댓글 삭제
    async deleteComment(
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        postId: number,
        commentId: number
    ) {
        // 게시판 권한 확인 + 게시글 존재 확인 (+ 비밀글 열람 확인)
        const { comment, post } = await this.checkComment(boardId, postId, commentId, user, 'delete');

        await this.prisma.$transaction( async (tx) => {
            await tx.comment.update({
                where:{
                    id: commentId
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            });

            // 관리 권한으로 남의 댓글을 지운 경우를 구분
            await this.audit.deleted( tx, commentId, `댓글 삭제${ comment.authorId !== user.id ? '(관리자)' : '' }`,
                { boardId, postId, authorId: comment.authorId, comment: comment.comment } );

        });

        // 커밋 후: 남의 댓글이면 작성자에게 알림 (본인 삭제는 BoardNotifier가 거른다)
        await this.boardNotifier.commentDeletedByAdmin({ boardId, post, comment, deleterId: user.id });

        return true;
    }

    //* 댓글 권한 확인
    private async checkComment(
        boardId: number,
        postId: number,
        commentId: number,
        user: Pick<Users, 'id' | 'role'>,
        action: 'update' | 'delete',
    ){
        const { perm, post } = await this.postsService.checkPost( boardId, postId, user, 'comment' );

        const comment = await this.prisma.comment.findFirst({
            where: { 
                id: commentId, 
                postId, 
                deleted: false 
            },
        });

        if( !comment ){
            throw new NotFoundException('댓글을 찾을 수 없습니다.');
        } 

        switch( action ){
            case 'update':
                if( user.id !== comment.authorId ){
                    throw new ForbiddenException('작성자만 수정할 수 있습니다.');
                }
            break;
            case 'delete':
                if( user.id !== comment.authorId && !perm.admin ){
                    throw new ForbiddenException('작성자 또는 관리자만 삭제할 수 있습니다.');
                }
            break;
        }

        return { comment, post };
    }

}