import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from 'src/generated/prisma/client';
import { FilesService } from 'src/common/files.service';
import { PaginatePage } from 'src/common/util/pagination.util';
import { toTreeList } from 'src/common/util/tree.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { DirectoryQueryDto } from './dto/directory-query.dto';

//* 조직도·사원 검색에 나오는 회원: 재직(ACTIVE) + 승인된 회원(GUEST 제외) + 삭제 안 됨 (공용 회원 검색 UserSearchService와 같은 조건)
const directoryUserWhere = {
    deleted: false,
    status: UserStatus.ACTIVE,
    role: { not: UserRole.GUEST },
} satisfies Prisma.UsersWhereInput;

//* 살아 있는 소속 (소속 행·부서 모두 삭제 안 됨)
const activeMembershipWhere = {
    deleted: false,
    department: { deleted: false },
} satisfies Prisma.UserDepartmentWhereInput;

// 다른 직원에게 보여도 되는 정보만 고른다. (2026-11-19 사용자 결정: 이메일·회사 전화 공개, 휴대폰·생일 비공개)
const directoryUserSelect = {
    id: true,
    empNo: true,
    name: true,
    email: true,
    tel: true,
    position: { select: { name: true, sortOrder: true } },
    departments: {
        where: activeMembershipWhere,
        select: {
            isPrimary: true,
            department: { select: { id: true, name: true } },
            jobTitle: { select: { name: true, sortOrder: true, deleted: true } },
        },
    },
} satisfies Prisma.UsersSelect;

type DirectoryUserRow = Prisma.UsersGetPayload<{ select: typeof directoryUserSelect }>;

export interface DirectoryDepartment {
    departmentId: number;
    departmentName: string;
    jobTitleName: string | null;
    isPrimary: boolean;         // false면 겸직
}

//* 조직도 구성원·사원 검색 공용 응답 (상세 창도 이 값을 그대로 쓴다)
export interface DirectoryUser {
    id: number;
    empNo: string;
    name: string;
    email: string;
    tel: string | null;         // 회사 전화 (휴대폰 hp는 내보내지 않는다)
    positionName: string | null;
    profileImageUrl: string | null;
    departments: DirectoryDepartment[]; // 대표 소속 먼저, 나머지는 부서명 순
}

//! 사용자용 조직도·사원 검색 (USER 이상, 2026-11-19 사용자 결정)
// - 관리자용 GET /departments·/users는 그대로 두고, 일반 직원에게 보여도 되는 값만 따로 내보낸다.
// - 구성원은 선택한 부서에 직접 소속된 사람만(하위 부서 제외), 겸직자도 포함한다.
@Injectable()
export class OrgChartService {

    constructor(
        private readonly prisma: PrismaService,
        private readonly filesService: FilesService,
    ){}

    //* 부서 트리 (트리 순서의 평평한 목록) + 부서별 구성원 수 (겸직 포함, 하위 부서 제외)
    async getChart() {
        const [ departments, counts ] = await Promise.all([
            this.prisma.department.findMany({
                select: { id: true, name: true, parentDepartmentId: true, sortOrder: true },
                where: { deleted: false },
            }),
            this.prisma.userDepartment.groupBy({
                by: [ 'departmentId' ],
                where: { ...activeMembershipWhere, user: directoryUserWhere },
                _count: { _all: true },
            }),
        ]);

        const countByDepartment = new Map( counts.map( ( c ) => [ c.departmentId, c._count._all ] ) );

        return toTreeList( departments, ( d ) => d.parentDepartmentId ).map( ( d ) => ({
            id: d.id,
            name: d.name,
            parentDepartmentId: d.parentDepartmentId,
            depth: d.depth,
            memberCount: countByDepartment.get( d.id ) ?? 0,
        }) );
    }

    //* 부서 구성원 - 정렬: 그 부서에서의 직책 순서 → 직급 순위(sortOrder가 작을수록 높음) → 이름. 직책·직급이 없으면 뒤로
    async getDepartmentMembers( departmentId: number ): Promise<DirectoryUser[]> {
        const department = await this.prisma.department.findFirst({ where: { id: departmentId, deleted: false }, select: { id: true } });
        if ( !department ) {
            throw new NotFoundException('부서를 찾을 수 없습니다.');
        }

        const rows = await this.prisma.users.findMany({
            select: directoryUserSelect,
            where: { ...directoryUserWhere, departments: { some: { ...activeMembershipWhere, departmentId } } },
        });

        const rank = ( value: number | null | undefined ) => value ?? Number.MAX_SAFE_INTEGER;
        const jobTitleOrder = ( row: DirectoryUserRow ) => {
            const jobTitle = row.departments.find( ( d ) => d.department.id === departmentId )?.jobTitle;
            return rank( jobTitle && !jobTitle.deleted ? jobTitle.sortOrder : null );
        };

        rows.sort( ( a, b ) =>
            jobTitleOrder( a ) - jobTitleOrder( b )
            || rank( a.position?.sortOrder ) - rank( b.position?.sortOrder )
            || a.name.localeCompare( b.name, 'ko' )
            || a.id - b.id,
        );

        return this.toDirectoryUsers( rows );
    }

    //* 사원 검색 - 이름·사번·부서명(겸직 포함) 부분 일치, 이름순 페이지
    async searchDirectory( query: DirectoryQueryDto ) {
        const keyword = query.search?.trim();
        const where: Prisma.UsersWhereInput = {
            ...directoryUserWhere,
            ...( keyword && {
                OR: [
                    { name: { contains: keyword, mode: 'insensitive' } },
                    { empNo: { contains: keyword, mode: 'insensitive' } },
                    { departments: { some: { ...activeMembershipWhere, department: { deleted: false, name: { contains: keyword, mode: 'insensitive' } } } } },
                ],
            }),
        };

        const page = await PaginatePage( query,
            ( args ) => this.prisma.users.findMany({ select: directoryUserSelect, where, orderBy: [ { name: 'asc' }, { id: 'asc' } ], ...args }),
            () => this.prisma.users.count({ where }),
        );

        return { ...page, data: await this.toDirectoryUsers( page.data ) };
    }

    //* 사원 한 명 (채팅 보낸 사람 등 id만 아는 화면의 상세 창) - 목록과 같은 대상 조건·공개 범위
    // 퇴사·비활성·승인 대기·삭제된 회원은 404
    async getDirectoryUser( userId: number ): Promise<DirectoryUser> {
        const row = await this.prisma.users.findFirst({
            select: directoryUserSelect,
            where: { ...directoryUserWhere, id: userId },
        });
        if ( !row ) {
            throw new NotFoundException('재직 중인 직원 정보를 찾을 수 없습니다.');
        }

        const [ user ] = await this.toDirectoryUsers( [ row ] );
        return user;
    }

    //* 행 → 응답 (프로필 사진은 쿼리 1번으로 붙인다)
    private async toDirectoryUsers( rows: DirectoryUserRow[] ): Promise<DirectoryUser[]> {
        const profileImageUrls = await this.filesService.findProfileImageUrls( rows.map( ( r ) => r.id ) );

        return rows.map( ( row ) => ({
            id: row.id,
            empNo: row.empNo,
            name: row.name,
            email: row.email,
            tel: row.tel,
            positionName: row.position?.name ?? null,
            profileImageUrl: profileImageUrls.get( row.id ) ?? null,
            departments: row.departments
                .map( ( d ) => ({
                    departmentId: d.department.id,
                    departmentName: d.department.name,
                    jobTitleName: d.jobTitle && !d.jobTitle.deleted ? d.jobTitle.name : null,
                    isPrimary: d.isPrimary,
                }) )
                .sort( ( a, b ) => Number( b.isPrimary ) - Number( a.isPrimary ) || a.departmentName.localeCompare( b.departmentName, 'ko' ) ),
        }) );
    }
}
