import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { BoardType, UserRole, Users } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { toTreeList } from "src/common/util/tree.util";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";
import { BoardAction, BoardPermission } from "./interface/board-permission.interface";
import { UserAccessInfo, UserMembership } from "./interface/user-access-info.interface";
import { BoardRule } from "./interface/board-rule.interface";
import { ALL_PERMISSION, boardRuleSelect, NO_PERMISSION } from "./const/board-permission.const";

//* 게시판 권한 CRUD + 접근 체크 로직
@Injectable()
export class BoardAuthService {

    constructor( private readonly prisma: PrismaService ){}

    //! =====================================================================
    //! 규칙 관리 (관리자)
    //! =====================================================================

    //* 게시판 권한 규칙 목록 (게시판당 규칙 수가 적으므로 페이지네이션 없음)
    async getBoardAuths( boardId: number ){
        await this.findBoardOrThrow( boardId );

        const auths = await this.prisma.boardAuth.findMany({
            select: {
                id: true,
                boardId: true,
                departmentId: true,
                includeSubDepartment: true,
                positionId: true,
                authAdmin: true,
                authRead: true,
                authWrite: true,
                authComment: true,
                department: { select: { id: true, name: true } },
                position: { select: { id: true, name: true, sortOrder: true } },
                jobTitles: {
                    select: { jobTitle: { select: { id: true, name: true } } },
                    orderBy: { jobTitle: { sortOrder: 'asc' } },
                },
            },
            where: {
                boardId,
                deleted: false,
            },
            orderBy: { id: 'asc' },
        });

        // 중간 테이블 구조({ jobTitle: {...} }[])를 직책 목록으로 펼친다.
        return auths.map( ({ jobTitles, ...auth }) => ({
            ...auth,
            jobTitles: jobTitles.map( ( j ) => j.jobTitle ),
        }));
    }

    //* 게시판 권한 규칙 생성
    async createBoardAuth(
        user: Pick<Users, 'id'>,
        boardId: number,
        body: CreateBoardAuthDto,
    ){
        await this.findBoardOrThrow( boardId );

        const target = this.normalizeRule({
            departmentId: body.departmentId ?? null,
            includeSubDepartment: body.includeSubDepartment ?? false,
            positionId: body.positionId ?? null,
            jobTitleIds: body.jobTitleIds ?? [],
            authAdmin: body.authAdmin ?? false,
            authRead: body.authRead ?? true,
            authWrite: body.authWrite ?? false,
            authComment: body.authComment ?? true,
        });

        await this.validateConditions( target.departmentId, target.positionId, target.jobTitleIds );

        const { jobTitleIds, ...rule } = target;

        // INSERT (중첩 쓰기: 규칙 + 허용 직책이 하나의 쿼리 묶음으로 함께 저장된다)
        const newAuth = await this.prisma.boardAuth.create({
            data: {
                ...rule,
                boardId,
                createdId: user.id,
                updatedId: user.id,
                jobTitles: {
                    createMany: {
                        data: jobTitleIds.map( ( jobTitleId ) => ({ jobTitleId }) ),
                    },
                },
            },
            select: { id: true },
        });

        return newAuth;
    }

    //* 게시판 권한 규칙 수정
    async updateBoardAuth(
        user: Pick<Users, 'id'>,
        boardId: number,
        authId: number,
        body: UpdateBoardAuthDto,
    ){
        const thisAuth = await this.prisma.boardAuth.findFirst({
            include: {
                jobTitles: { select: { jobTitleId: true } },
            },
            where: {
                id: authId,
                boardId,
                deleted: false,
                board: { deleted: false },
            },
        });

        if( !thisAuth ){
            throw new BadRequestException('존재하지 않는 게시판 권한입니다.');
        }

        // undefined면 기존 값 유지 (null은 "조건 없음"으로 변경)
        const target = this.normalizeRule({
            departmentId: body.departmentId !== undefined ? body.departmentId : thisAuth.departmentId,
            includeSubDepartment: body.includeSubDepartment ?? thisAuth.includeSubDepartment,
            positionId: body.positionId !== undefined ? body.positionId : thisAuth.positionId,
            jobTitleIds: body.jobTitleIds ?? thisAuth.jobTitles.map( ( j ) => j.jobTitleId ),
            authAdmin: body.authAdmin ?? thisAuth.authAdmin,
            authRead: body.authRead ?? thisAuth.authRead,
            authWrite: body.authWrite ?? thisAuth.authWrite,
            authComment: body.authComment ?? thisAuth.authComment,
        });

        await this.validateConditions( target.departmentId, target.positionId, target.jobTitleIds );

        const { jobTitleIds, ...rule } = target;

        // UPDATE (중첩 쓰기: 규칙 수정 + 직책 "전부 지우고 다시 넣기"가 하나의 트랜잭션으로 실행된다)
        // 중간 테이블은 이력이 필요 없으므로 변경분 비교 대신 전체 교체한다.
        await this.prisma.boardAuth.update({
            where: {
                id: thisAuth.id,
                deleted: false,
            },
            data: {
                ...rule,
                updatedId: user.id,
                jobTitles: body.jobTitleIds === undefined ? undefined : {
                    deleteMany: {},
                    createMany: {
                        data: jobTitleIds.map( ( jobTitleId ) => ({ jobTitleId }) ),
                    },
                },
            },
        });

        return true;
    }

    //* 게시판 권한 규칙 삭제
    // 규칙이 모두 지워진 게시판은 관리자만 볼 수 있다. (기본 거부)
    async deleteBoardAuth(
        user: Pick<Users, 'id'>,
        boardId: number,
        authId: number,
    ){
        // 존재 확인 + 삭제 (where에 boardId를 함께 걸어 다른 게시판의 규칙을 지우지 못하게 한다)
        const { count } = await this.prisma.boardAuth.updateMany({
            where: {
                id: authId,
                boardId,
                deleted: false,
            },
            data: {
                deleted: true,
                deletedAt: new Date(),
                deletedId: user.id,
            },
        });

        if( count === 0 ){
            throw new BadRequestException('존재하지 않는 게시판 권한입니다.');
        }

        return true;
    }

    //* 규칙 정규화
    // - 부서 조건이 없으면 하위 부서 포함은 의미가 없으므로 false
    // - 쓰기·댓글·관리 권한은 읽기 권한이 있어야 의미가 있으므로 읽기를 함께 켠다.
    // - 권한이 하나도 없는 규칙은 아무 효과가 없으므로 거부
    private normalizeRule<T extends {
        departmentId: number | null;
        includeSubDepartment: boolean;
        authAdmin: boolean;
        authRead: boolean;
        authWrite: boolean;
        authComment: boolean;
    }>( rule: T ): T {
        const result = { ...rule };

        if( result.departmentId === null ){
            result.includeSubDepartment = false;
        }

        if( result.authWrite || result.authComment || result.authAdmin ){
            result.authRead = true;
        }

        if( !result.authRead ){
            throw new BadRequestException('최소 하나의 권한을 선택하세요.');
        }

        return result;
    }

    //* 조건 검증 (부서·직급·직책이 존재하고 삭제되지 않았는지)
    private async validateConditions(
        departmentId: number | null,
        positionId: number | null,
        jobTitleIds: number[],
    ){
        if( departmentId !== null ){
            const department = await this.prisma.department.findFirst({
                select: { id: true },
                where: { id: departmentId, deleted: false },
            });

            if( !department ){
                throw new BadRequestException('존재하지 않는 부서입니다.');
            }
        }

        if( positionId !== null ){
            const position = await this.prisma.position.findFirst({
                select: { id: true },
                where: { id: positionId, deleted: false },
            });

            if( !position ){
                throw new BadRequestException('존재하지 않는 직급입니다.');
            }
        }

        if( jobTitleIds.length > 0 ){
            const jobTitleCount = await this.prisma.jobTitle.count({
                where: {
                    id: { in: jobTitleIds },
                    deleted: false,
                },
            });

            // DTO의 ArrayUnique로 중복이 없으므로 개수만 비교하면 된다.
            if( jobTitleCount !== jobTitleIds.length ){
                throw new BadRequestException('존재하지 않는 직책이 포함되어 있습니다.');
            }
        }
    }

    //* 게시판 존재 확인 (카테고리는 하위 게시판 기준으로 표시되므로 규칙을 두지 않는다)
    private async findBoardOrThrow( boardId: number ){
        const board = await this.prisma.board.findFirst({
            select: { id: true, type: true },
            where: {
                id: boardId,
                deleted: false,
            },
        });

        if( !board ){
            throw new BadRequestException('존재하지 않는 게시판입니다.');
        }

        if( board.type === BoardType.CATEGORY ){
            throw new BadRequestException('카테고리에는 권한을 설정할 수 없습니다.');
        }

        return board;
    }


    //! =====================================================================
    //! 게시판 권한 판정 
    //! =====================================================================

    //* 게시판 내비게이션 (읽기 권한이 있는 게시판만 트리 순서로 반환)
    // 회원 정보와 전체 게시판·규칙을 한 번씩만 조회하고, 게시판별 판정은 메모리에서 한다.
    async getUserBoardNavigate(
        user: Pick<Users, 'id' | 'role'>,
    ){
        // 가입 승인 전 회원은 볼 수 있는 게시판이 없다.
        if( user.role === UserRole.GUEST ){
            return [];
        }

        const isAdmin = user.role === UserRole.ADMIN;

        const [boards, userInfo] = await Promise.all([
            this.prisma.board.findMany({
                select: {
                    id: true,
                    parentBoardId: true,
                    type: true,
                    name: true,
                    description: true,
                    sortOrder: true,
                    auths: {
                        select: boardRuleSelect,
                        where: { deleted: false },
                    },
                },
                where: { deleted: false },
            }),
            // 관리자는 규칙과 비교하지 않으므로 회원 정보를 조회하지 않는다.
            isAdmin ? null : this.loadUserContext( user ),
        ]);

        // 1. 읽기 권한이 있는 게시판 (카테고리는 규칙이 없으므로 제외)
        const visibleIds = new Set(
            boards
                .filter( ( board ) => board.type !== BoardType.CATEGORY )
                .filter( ( board ) => userInfo === null || this.evaluate( board.auths, userInfo ).read )
                .map( ( board ) => board.id ),
        );

        // 2. 카테고리는 볼 수 있는 하위 게시판이 하나라도 있을 때만 표시
        for( const board of boards ){
            if( board.parentBoardId !== null && visibleIds.has( board.id ) ){
                visibleIds.add( board.parentBoardId );
            }
        }

        // 3. 트리 순서로 정리 (규칙은 응답에서 제외)
        const visibleBoards = boards
            .filter( ( board ) => visibleIds.has( board.id ) )
            .map( ( board ) => ({
                id: board.id,
                parentBoardId: board.parentBoardId,
                type: board.type,
                name: board.name,
                description: board.description,
                sortOrder: board.sortOrder,
            }));

        return toTreeList( visibleBoards, ( board ) => board.parentBoardId );
    }

    //* 게시판 권한 검사 (게시글·댓글 서비스에서 요청마다 호출)
    // - 읽기 권한이 없으면 게시판이 있다는 사실도 숨기기 위해 404, 요청한 동작의 권한이 없으면 403
    // - 반환한 권한은 버튼 표시용 응답이나 삭제 조건(작성자 또는 관리 권한) 확인에 이어서 쓴다.
    async assertBoardPermission(
        boardId: number,
        user: Pick<Users, 'id' | 'role'>,
        action: BoardAction,
    ): Promise<BoardPermission> {
        const board = await this.prisma.board.findFirst({
            select: { id: true, type: true },
            where: {
                id: boardId,
                deleted: false,
            },
        });

        // 없는 게시판, 카테고리(글을 두지 않음), 가입 승인 전 회원은 "볼 수 없음"과 같이 처리
        if( !board || board.type === BoardType.CATEGORY || user.role === UserRole.GUEST ){
            throw new NotFoundException('게시판을 찾을 수 없습니다.');
        }

        let perm: BoardPermission = { ...ALL_PERMISSION };

        // 시스템 관리자가 아니면 규칙과 회원 정보를 비교한다. (서로 관계없는 조회라 동시에 실행)
        if( user.role !== UserRole.ADMIN ){
            const [boardRules, userInfo] = await Promise.all([
                this.prisma.boardAuth.findMany({
                    select: boardRuleSelect,
                    where: {
                        boardId,
                        deleted: false,
                    },
                }),
                this.loadUserContext( user ),
            ]);

            perm = this.evaluate( boardRules, userInfo );
        }

        // 읽기 권한이 없으면 404
        if( !perm.read ){
            throw new NotFoundException('게시판을 찾을 수 없습니다.');
        }

        // 요청한 동작의 권한이 없으면 403
        if( !perm[action] ){
            throw new ForbiddenException('권한이 없습니다.');
        }

        return perm;
    }

    //* 규칙과 비교할 회원 정보 (직급 + 소속별 부서·상위 부서·직책)
    private async loadUserContext(
        user: Pick<Users, 'id'>,
    ): Promise<UserAccessInfo> {
        const [thisUser, departments] = await Promise.all([
            this.prisma.users.findFirst({
                select: {
                    position: { select: { sortOrder: true } },
                    departments: {
                        select: { departmentId: true, jobTitleId: true },
                        where: {
                            deleted: false,
                            department: { deleted: false },
                        },
                    },
                },
                where: {
                    id: user.id,
                    deleted: false,
                },
            }),
            // 상위 부서를 찾기 위한 부서 트리 (부서 수가 많지 않아 전체를 한 번에 조회)
            this.prisma.department.findMany({
                select: { id: true, parentDepartmentId: true },
                where: { deleted: false },
            }),
        ]);

        if( !thisUser ){
            return { positionSortOrder: null, memberships: [] };
        }

        // 부서 id → 상위 부서 id
        const parentOf = new Map( departments.map( ( d ) => [ d.id, d.parentDepartmentId ] ) );

        const memberships: UserMembership[] = thisUser.departments.map( ( m ) => ({
            departmentId: m.departmentId,
            departmentWithAncestorIds: this.getSelfAndAncestorIds( m.departmentId, parentOf ),
            jobTitleId: m.jobTitleId,
        }));

        return {
            positionSortOrder: thisUser.position?.sortOrder ?? null,
            memberships,
        };
    }

    //* 자기 부서부터 최상위 부서까지의 id
    private getSelfAndAncestorIds(
        departmentId: number,
        parentOf: Map<number, number | null>,
    ){
        const ids: number[] = [];
        let current: number | null | undefined = departmentId;

        // 부서 수정 시 순환 참조를 막고 있지만, 혹시 생겨도 무한 반복하지 않도록 이미 방문한 부서에서 멈춘다.
        while( current !== null && current !== undefined && !ids.includes( current ) ){
            ids.push( current );
            current = parentOf.get( current );
        }

        return ids;
    }

    //* 규칙과 회원 정보를 비교해 권한 계산 (DB 조회 없음)
    // - 규칙 안의 조건은 AND, 해당하는 규칙이 여러 개면 권한별 OR(합집합)
    // - 해당하는 규칙이 없으면 모두 false (기본 거부)
    private evaluate(
        boardRules: BoardRule[],
        userInfo: UserAccessInfo,
    ): BoardPermission {
        const matched = boardRules.filter( ( rule ) => this.matchesRule( rule, userInfo ) );

        if( matched.length === 0 ){
            return { ...NO_PERMISSION };
        }

        return {
            read: matched.some( ( rule ) => rule.authRead ),
            write: matched.some( ( rule ) => rule.authWrite ),
            comment: matched.some( ( rule ) => rule.authComment ),
            admin: matched.some( ( rule ) => rule.authAdmin ),
        };
    }

    //* 회원이 규칙의 조건을 모두 만족하는지 (비어 있는 조건은 통과)
    private matchesRule(
        rule: BoardRule,
        userInfo: UserAccessInfo,
    ){
        // 1. 최소 직급: 직급 순서는 위쪽(sortOrder가 작을수록)이 높으므로, 회원 sortOrder가 기준 이하면 통과
        if( rule.position !== null ){
            if( userInfo.positionSortOrder === null || userInfo.positionSortOrder > rule.position.sortOrder ){
                return false;
            }
        }

        // 2. 부서·직책: 둘 다 조건이 없으면 통과
        const jobTitleIds = rule.jobTitles.map( ( j ) => j.jobTitleId );

        if( rule.departmentId === null && jobTitleIds.length === 0 ){
            return true;
        }

        // 겸직이면 소속마다 확인하고, 같은 소속 안에서 부서와 직책을 함께 만족해야 한다.
        return userInfo.memberships.some( ( m ) => {
            const departmentOk = rule.departmentId === null
                || ( rule.includeSubDepartment
                    ? m.departmentWithAncestorIds.includes( rule.departmentId )
                    : m.departmentId === rule.departmentId );

            const jobTitleOk = jobTitleIds.length === 0
                || ( m.jobTitleId !== null && jobTitleIds.includes( m.jobTitleId ) );

            return departmentOk && jobTitleOk;
        });
    }

}
