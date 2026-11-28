import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AdminPermission, AuditTargetType, BoardType, Prisma, UserRole, Users, UserStatus } from "src/generated/prisma/client";
import { hasAdminPermission } from "src/auth/util/admin-permission.util";
import { PrismaService } from "src/prisma/prisma.service";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { toTreeList } from "src/common/util/tree.util";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";
import { BoardAction, BoardPermission, BoardAccess } from "./interface/board-permission.interface";
import { UserAccessInfo, UserMembership } from "./interface/user-access-info.interface";
import { ALL_PERMISSION, boardRuleSelect } from "./const/board-permission.const";
import { evaluateBoardPermission } from "./util/board-permission.util";

//* 게시판 권한 CRUD + 접근 체크 로직
@Injectable()
export class BoardAuthService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.BOARD_AUTH );
    }

    //! =====================================================================
    //! 규칙 관리 (관리자)
    //! =====================================================================

    //* 게시판 권한 규칙 목록 (규칙이 적어서 페이지 없음)
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

        // INSERT (중첩 쓰기로 규칙과 허용 직책을 함께 저장) + 감사 로그
        return await this.prisma.$transaction( async (tx) => {
            const newAuth = await tx.boardAuth.create({
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

            await this.audit.created( tx, newAuth.id, '게시판 권한 규칙 생성', { boardId, rule: target } );

            return newAuth;
        });
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

        // UPDATE (규칙 수정 + 직책 전부 지우고 다시 넣기를 한 트랜잭션으로)
        // 중간 테이블은 이력이 필요 없어서 통째로 바꾼다
        await this.prisma.$transaction( async (tx) => {
            await tx.boardAuth.update({
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

            const sortIds = ( ids: number[] ) => [ ...ids ].sort( ( a, b ) => a - b );
            const before = { ...thisAuth, jobTitleIds: sortIds( thisAuth.jobTitles.map( ( j ) => j.jobTitleId ) ) };

            await this.audit.updated( tx, thisAuth.id, '게시판 권한 규칙 수정',
                diffChanges( before, { ...rule, jobTitleIds: sortIds( jobTitleIds ) } ), { boardId } );
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
        // 존재 확인 + 삭제 (boardId를 같이 걸어 다른 게시판의 규칙은 못 지우게)
        await this.prisma.$transaction( async (tx) => {
            const { count } = await tx.boardAuth.updateMany({
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

            await this.audit.deleted( tx, authId, '게시판 권한 규칙 삭제', { boardId } );
        });

        return true;
    }

    //* 규칙 정규화
    // - 부서 조건이 없으면 하위 부서 포함은 false
    // - 쓰기·댓글·관리 권한이 있으면 읽기도 켠다
    // - 권한이 하나도 없는 규칙은 거부
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
        
        if( result.authAdmin ){
            result.authWrite = true;
            result.authComment = true;
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

            // DTO의 ArrayUnique로 중복이 없어서 개수만 비교한다
            if( jobTitleCount !== jobTitleIds.length ){
                throw new BadRequestException('존재하지 않는 직책이 포함되어 있습니다.');
            }
        }
    }

    //* 게시판 존재 확인 (카테고리에는 규칙을 두지 않는다)
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
    // 회원·게시판·규칙을 한 번씩만 읽고 판정은 메모리에서 한다.
    async getUserBoardNavigate(
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
    ){
        // 가입 승인 전 회원은 볼 수 있는 게시판이 없다.
        if( user.role === UserRole.GUEST ){
            return [];
        }

        // 게시판 관리 기능을 가진 관리자(슈퍼관리자 포함)는 규칙과 관계없이 모든 게시판
        const isAdmin = hasAdminPermission( user, AdminPermission.BOARDS );

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
                .filter( ( board ) => userInfo === null || evaluateBoardPermission( board.auths, userInfo ).read )
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

    //* 게시판 권한 검사 (게시글·댓글 서비스가 요청마다 호출)
    // 읽기 권한이 없으면 게시판이 있다는 것도 숨기려고 404, 동작 권한이 없으면 403
    // 게시판 정보도 같이 돌려줘서 호출한 쪽이 다시 조회하지 않게 한다.
    async assertBoardPermission(
        boardId: number,
        user: Pick<Users, 'id' | 'role' | 'adminPermissions'>,
        action: BoardAction,
    ): Promise<BoardAccess> {
        const board = await this.prisma.board.findFirst({
            select: { id: true, type: true, name: true, description: true, allowSecret: true, isAnonymous: true, showLeaves: true },
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

        // 게시판 관리 기능이 없으면 규칙과 회원 정보를 비교한다 (두 조회는 동시에)
        if( !hasAdminPermission( user, AdminPermission.BOARDS ) ){
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

            perm = evaluateBoardPermission( boardRules, userInfo );
        }

        // 읽기 권한이 없으면 404
        if( !perm.read ){
            throw new NotFoundException('게시판을 찾을 수 없습니다.');
        }

        // 요청한 동작의 권한이 없으면 403
        if( !perm[action] ){
            throw new ForbiddenException('권한이 없습니다.');
        }

        return { board, perm };
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
            // 상위 부서를 찾기 위한 부서 트리 (부서 수가 적어 전체를 읽는다)
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

        return this.toUserAccessInfo( thisUser, parentOf );
    }

    //* 조회한 회원을 규칙 비교용 형태로 (한 명·여러 명 공용)
    private toUserAccessInfo(
        user: {
            position: { sortOrder: number } | null;
            departments: { departmentId: number; jobTitleId: number | null }[];
        },
        parentOf: Map<number, number | null>,
    ): UserAccessInfo {
        const memberships: UserMembership[] = user.departments.map( ( m ) => ({
            departmentId: m.departmentId,
            departmentWithAncestorIds: this.getSelfAndAncestorIds( m.departmentId, parentOf ),
            jobTitleId: m.jobTitleId,
        }));

        return {
            positionSortOrder: user.position?.sortOrder ?? null,
            memberships,
        };
    }

    //* 게시판을 읽을 수 있는 회원 id 목록 (공지 알림 대상)
    // 회원 수만큼 쿼리하지 않도록 한 번씩 읽고 회원별 판정은 메모리에서 한다.
    async findReadableUserIds(
        boardId: number,
        tx?: Prisma.TransactionClient,
    ): Promise<number[]> {
        const db = tx ?? this.prisma;

        const [boardRules, users, departments] = await Promise.all([
            db.boardAuth.findMany({
                select: boardRuleSelect,
                where: {
                    boardId,
                    deleted: false,
                },
            }),
            db.users.findMany({
                select: {
                    id: true,
                    role: true,
                    adminPermissions: true, // 게시판 관리 기능을 가진 관리자는 규칙과 관계없이 읽을 수 있다
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
                    role: { not: UserRole.GUEST },
                    status: UserStatus.ACTIVE,
                    deleted: false,
                },
            }),
            db.department.findMany({
                select: { id: true, parentDepartmentId: true },
                where: { deleted: false },
            }),
        ]);

        const parentOf = new Map( departments.map( ( d ) => [ d.id, d.parentDepartmentId ] ) );

        return users
            .filter( ( u ) => hasAdminPermission( u, AdminPermission.BOARDS ) || evaluateBoardPermission( boardRules, this.toUserAccessInfo( u, parentOf ) ).read )
            .map( ( u ) => u.id );
    }

    //* 자기 부서부터 최상위 부서까지의 id
    private getSelfAndAncestorIds(
        departmentId: number,
        parentOf: Map<number, number | null>,
    ){
        const ids: number[] = [];
        let current: number | null | undefined = departmentId;

        // 부서 순환은 수정할 때 막지만, 혹시 생겨도 무한 반복하지 않게 방문한 부서에서 멈춘다
        while( current !== null && current !== undefined && !ids.includes( current ) ){
            ids.push( current );
            current = parentOf.get( current );
        }

        return ids;
    }
}
