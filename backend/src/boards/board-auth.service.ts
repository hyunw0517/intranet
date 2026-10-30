import { BadRequestException, Injectable } from "@nestjs/common";
import { BoardType, Users } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateBoardAuthDto } from "./dto/create-board-auth.dto";
import { UpdateBoardAuthDto } from "./dto/update-board-auth.dto";

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
    //! 권한 판정 
    //! =====================================================================

}
