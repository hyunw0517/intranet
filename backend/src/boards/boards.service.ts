import { BadRequestException, Injectable } from '@nestjs/common';
import { BoardType, Users } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { isSameIdSet } from 'src/common/util/id-set.util';
import { toTreeList } from 'src/common/util/tree.util';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { UpdateBoardOrderDto } from './dto/update-board-order.dto';

//* 게시판 계층 규칙
// - 상위 게시판은 CATEGORY만 지정 가능.
// - CATEGORY는 최상위에만 둔다. (카테고리 안에 카테고리 불가 → 깊이는 최대 2단계)
@Injectable()
export class BoardsService {

    constructor( private readonly prisma: PrismaService ){}

    //* 관리자 전체 게시판 조회
    // 트리 순서(카테고리 → 하위 게시판들 → 다음 카테고리) 리스트 전체로 반환
    async getAdminBoards() {
        const boards = await this.prisma.board.findMany({
            select: {
                id: true,
                parentBoardId: true,
                type: true,
                name: true,
                description: true,
                isAnonymous: true,
                allowSecret: true,
                sortOrder: true,
                _count: {
                    select: {
                        // 포스트 수
                        posts: { 
                            where: { 
                                deleted: false, 
                            } 
                        },
                        // 권한 수
                        auths: { 
                            where: { 
                                deleted: false, 
                            } 
                        },
                    },
                },
            },
            where: {
                deleted: false,
            },
        });

        const result = toTreeList( boards, ( board ) => board.parentBoardId );

        // _count를 필드로 반환
        return result.map( ({ _count, ...board }) => ({
            ...board,
            postCount: _count.posts,
            authCount: _count.auths,
        }));
    }

    //* 게시판 생성
    async createBoard(
        user: Pick<Users, 'id'>,
        body: CreateBoardDto,
    ){
        const targetParentId = body.parentBoardId ?? null;
        const targetType = body.type ?? BoardType.NORMAL;

        // 상위 게시판 검증
        await this.validateParent( targetParentId, targetType );

        // 중복 확인 (같은 상위 아래에서만 이름 중복 불가)
        await this.validateNameUnique( targetParentId, body.name );

        // 카운트 세어서 sortOrder에 정렬순서 대조 (맨 뒤에 추가)
        const boardCount = await this.prisma.board.count({
            where: {
                parentBoardId: targetParentId,
                deleted: false,
            },
        });

        // INSERT
        const newBoard = await this.prisma.board.create({
            data: {
                parentBoardId: targetParentId,
                type: targetType,
                name: body.name,
                description: body.description ?? null,
                isAnonymous: body.isAnonymous,
                allowSecret: body.allowSecret,
                sortOrder: boardCount,
                createdId: user.id,
                updatedId: user.id,
            },
        });

        return newBoard;
    }

    //* 게시판 수정
    async updateBoard(
        user: Pick<Users, 'id'>,
        boardId: number,
        body: UpdateBoardDto,
    ){
        // 존재 확인
        const thisBoard = await this.prisma.board.findFirst({
            where: {
                id: boardId,
                deleted: false,
            },
        });

        if( !thisBoard ){
            throw new BadRequestException('존재하지 않는 게시판입니다.');
        }

        // undefined면 기존 값 유지
        const targetParentId = ( body.parentBoardId !== undefined ) ? body.parentBoardId : thisBoard.parentBoardId;
        const targetType = body.type ?? thisBoard.type;

        // 타입 변경 검증
        if( targetType !== thisBoard.type ){
            await this.validateTypeChange( thisBoard.id, thisBoard.type, targetType );
        }

        // 상위 게시판 검증
        if( targetParentId !== thisBoard.parentBoardId || targetType !== thisBoard.type ){
            await this.validateParent( targetParentId, targetType );
        }

        // 중복 확인 (같은 상위 아래에서만 이름 중복 불가 + 자기 자신 제외)
        await this.validateNameUnique( targetParentId, body.name, thisBoard.id );

        const data = {
            type: targetType,
            name: body.name,
            description: body.description, 
            isAnonymous: body.isAnonymous,
            allowSecret: body.allowSecret,
            updatedId: user.id,
        };

        // UPDATE (상위 게시판이 변경되는 경우 -> 트랜잭션: 수정+재정렬)
        if( targetParentId !== thisBoard.parentBoardId ){

            // 이동하려는 상위 게시판의 하위 게시판 수 (맨 뒤에 추가)
            const moveBoardGroupCount = await this.prisma.board.count({
                where: {
                    parentBoardId: targetParentId,
                    deleted: false,
                },
            });

            const [updateBoard] = await this.prisma.$transaction([
                this.prisma.board.update({
                    where: {
                        id: thisBoard.id,
                        deleted: false,
                    },
                    data: {
                        ...data,
                        parentBoardId: targetParentId,
                        sortOrder: moveBoardGroupCount,
                    },
                }),
                // 이전 상위 게시판에 남은 게시판들을 재정렬
                this.prisma.board.updateMany({
                    where: {
                        parentBoardId: thisBoard.parentBoardId,
                        sortOrder: { gt: thisBoard.sortOrder },
                        deleted: false,
                    },
                    data: {
                        sortOrder: { decrement: 1 },
                    },
                }),
            ]);

            return updateBoard;
        }

        // UPDATE (상위 게시판 변동이 없는 경우 -> 트랜잭션 없이 수정)
        const updateBoard = await this.prisma.board.update({
            where: {
                id: thisBoard.id,
                deleted: false,
            },
            data,
        });

        return updateBoard;
    }

    //* 게시판 순서 변경 (드래그 정렬)
    // - 같은 상위 게시판 아래의 형제 게시판끼리만 순서를 바꾼다. (상위 이동은 게시판 수정에서)
    // - 받은 id 배열이 그 상위 게시판의 하위 게시판 전체와 정확히 일치해야 한다.
    async updateBoardOrder(
        user: Pick<Users, 'id'>,
        body: UpdateBoardOrderDto,
    ){
        const parentBoardId = body.parentBoardId ?? null;

        await this.prisma.$transaction( async (tx) => {
            const siblings = await tx.board.findMany({
                select: { id: true },
                where: {
                    parentBoardId,
                    deleted: false,
                },
            });

            if( !isSameIdSet( siblings.map( (b) => b.id ), body.ids ) ){
                throw new BadRequestException('게시판 목록이 변경되었습니다. 새로고침 후 다시 시도하세요.');
            }

            for( const [ index, id ] of body.ids.entries() ){
                await tx.board.update({
                    where: { id },
                    data: {
                        sortOrder: index,
                        updatedId: user.id,
                    },
                });
            }
        });

        return true;
    }

    //* 게시판 삭제
    async deleteBoard(
        user: Pick<Users, 'id'>,
        boardId: number,
    ){
        // 존재 확인
        const thisBoard = await this.prisma.board.findFirst({
            where: {
                id: boardId,
                deleted: false,
            },
        });

        if( !thisBoard ){
            throw new BadRequestException('존재하지 않는 게시판입니다.');
        }

        // 하위 게시판 확인 (카테고리)
        if( await this.countChildren( thisBoard.id ) > 0 ){
            throw new BadRequestException('하위 게시판이 있는 카테고리는 삭제할 수 없습니다.');
        }

        // 게시글 확인 -> 삭제하면 글에 접근할 경로가 사라지므로 막는다.
        if( await this.countPosts( thisBoard.id ) > 0 ){
            throw new BadRequestException('게시글이 있는 게시판은 삭제할 수 없습니다.');
        }

        // DELETE (트랜잭션: 삭제+권한 규칙 삭제+재정렬)
        await this.prisma.$transaction([
            // 대상 게시판 삭제
            this.prisma.board.update({
                where: {
                    id: thisBoard.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            }),

            // 게시판의 권한 규칙도 함께 삭제
            // (남겨 두면 그 규칙이 참조하는 부서·직급·직책을 영영 삭제할 수 없게 된다)
            this.prisma.boardAuth.updateMany({
                where: {
                    boardId: thisBoard.id,
                    deleted: false,
                },
                data: {
                    deleted: true,
                    deletedAt: new Date(),
                    deletedId: user.id,
                },
            }),

            // 삭제된 게시판을 제외한 동일한 상위 게시판을 가진 게시판들을 재정렬
            this.prisma.board.updateMany({
                where: {
                    parentBoardId: thisBoard.parentBoardId,
                    sortOrder: { gt: thisBoard.sortOrder }, // 기준 sortOrder를 초과한 정렬 데이터만
                    deleted: false,
                },
                data: {
                    sortOrder: { decrement: 1 }, // -1씩
                },
            }),
        ]);

        return true;
    }

    //* 상위 게시판 검증 (계층 규칙)
    private async validateParent(
        parentBoardId: number | null,
        type: BoardType,
    ){
        if( parentBoardId === null ){
            return;
        }

        if( type === BoardType.CATEGORY ){
            throw new BadRequestException('카테고리는 최상위에만 둘 수 있습니다.');
        }

        const parentBoard = await this.prisma.board.findFirst({
            select: { type: true },
            where: {
                id: parentBoardId,
                deleted: false,
            },
        });

        if( !parentBoard ){
            throw new BadRequestException('존재하지 않는 상위 게시판입니다.');
        }

        if( parentBoard.type !== BoardType.CATEGORY ){
            throw new BadRequestException('상위 게시판은 카테고리만 지정할 수 있습니다.');
        }
    }

    //* 타입 변경 검증
    // - CATEGORY ↔ 게시판: 카테고리는 글을, 게시판은 하위 게시판을 가질 수 없으므로 비어 있을 때만 가능
    // - CALENDAR ↔ 그 외: 캘린더 글은 일정 필드(eventStartAt 등)를 쓰므로 글이 없을 때만 가능
    // - NORMAL ↔ NOTICE: 글 구조가 같아 자유롭게 변경
    private async validateTypeChange(
        boardId: number,
        fromType: BoardType,
        toType: BoardType,
    ){
        if( fromType === BoardType.CATEGORY ){
            if( await this.countChildren( boardId ) > 0 ){
                throw new BadRequestException('하위 게시판이 있는 카테고리는 타입을 변경할 수 없습니다.');
            }
            return;
        }

        if( toType === BoardType.CATEGORY || fromType === BoardType.CALENDAR || toType === BoardType.CALENDAR ){
            if( await this.countPosts( boardId ) > 0 ){
                throw new BadRequestException('게시글이 있는 게시판은 카테고리·캘린더 타입으로(또는 캘린더에서) 변경할 수 없습니다.');
            }
        }
    }

    //* 이름 중복 검증 (같은 상위 아래에서만 중복 불가, 상위가 다르면 허용)
    private async validateNameUnique(
        parentBoardId: number | null,
        name: string,
        excludeId?: number,
    ){
        const nameExists = await this.prisma.board.findFirst({
            where: {
                id: excludeId !== undefined ? { not: excludeId } : undefined,
                parentBoardId,
                name,
                deleted: false,
            },
        });

        if( nameExists ){
            throw new BadRequestException('이미 존재하는 게시판명입니다.');
        }
    }

    //* 하위 게시판 수 반환
    private countChildren( boardId: number ){
        return this.prisma.board.count({
            where: {
                parentBoardId: boardId,
                deleted: false,
            },
        });
    }

    //* 게시판의 게시글 수 반환
    private countPosts( boardId: number ){
        return this.prisma.post.count({
            where: {
                boardId,
                deleted: false,
            },
        });
    }

}
