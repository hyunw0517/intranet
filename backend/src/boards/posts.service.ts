import { Injectable } from "@nestjs/common";
import { Prisma, Users } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { BoardAuthService } from "./board-auth.service";
import { PaginatePostQueryDto, PostSortBy } from "./dto/paginate-post-query.dto";
import { PaginatePage } from "src/common/util/pagination.util";
import { BoardPermission } from "./interface/board-permission.interface";

@Injectable()
export class PostsService {
    
    constructor( 
        private readonly prisma: PrismaService, 
        private readonly boardAuthService: BoardAuthService, 
    ){}

    async paginatePost( 
        user: Pick<Users, 'id' | 'role'>, 
        boardId: number, 
        query: PaginatePostQueryDto 
    ) {

        // 게시판 권한 확인 (읽기 권한)
        const perm = await this.boardAuthService.assertBoardPermission( boardId, user, 'read' );
        
        const hasSearch = !!( query.title || query.content || query.author );

        const where: Prisma.PostWhereInput = {
            boardId,
            deleted: false,
            title: query.title ? { contains: query.title, mode: 'insensitive' } : undefined,
            content: query.content ? { contains: query.content, mode: 'insensitive' } : undefined,
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

        return {
            pinned: pinned.map( row => this.maskSecretPost( row, user, perm ) ),
            ...list,
            data: list.data.map( row => this.maskSecretPost( row, user, perm ) ),
        };
    }

    //* 게시글 목록 select (일반 조회·정렬 조회 공용)
    private postListSelect() {
        return {
            id: true,
            title: true, 
            authorDepartmentName: true,
            authorPositionName: true,
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
    private canViewSecret(
        post: { isSecret: boolean; author: { id: number } },
        user: Pick<Users, 'id'>,
        perm: BoardPermission,
    ): boolean {
        return !post.isSecret || perm.admin || post.author.id === user.id;
    }

    //* 볼 수 없는 비밀글은 제목·작성자 정보를 가린다.
    // Prisma select는 행마다 다르게 고를 수 없으므로 조회 후 가린다. (프론트에서 가리면 응답에 원본이 남음)
    private maskSecretPost<T extends { isSecret: boolean; author: { id: number } }>(
        post: T,
        user: Pick<Users, 'id'>,
        perm: BoardPermission,
    ) {
        if( this.canViewSecret( post, user, perm ) ){
            return post;
        }

        return {
            ...post,
            title: "비밀글입니다.",
            author: null,
            authorDepartmentName: null,
            authorPositionName: null,
        };
    }

}