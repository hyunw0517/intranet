import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, UserRole, UserStatus } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

//* 결재자 정보 (현재 값) - 문서 단계 스냅샷과 템플릿 화면 표시에 쓴다
export interface ApproverInfo {
    id: number;
    name: string;
    empNo: string;
    departmentName: string | null;  // 주 소속 부서
    positionName: string | null;    // 직급
    jobTitleName: string | null;    // 주 소속의 직책
    usable: boolean;                // 결재자로 지정할 수 있는지 (재직 + USER/ADMIN + 삭제 안 됨)
}

//* 결재자 조회·검사 (결재라인 템플릿·결재 문서 공용)
// 핵심(users·organization) 데이터를 읽기만 한다. (애드온 → 핵심 읽기는 허용 방향)
@Injectable()
export class ApproversService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    //* id → 결재자 정보 (없는 id는 결과에 없다)
    async load( ids: number[], db: Prisma.TransactionClient | PrismaService = this.prisma ): Promise<Map<number, ApproverInfo>> {
        if ( ids.length === 0 ) return new Map();

        const users = await db.users.findMany({
            where: { id: { in: [ ...new Set( ids ) ] } },
            select: {
                id: true, name: true, empNo: true, role: true, status: true, deleted: true,
                position: { select: { name: true } },
                departments: {
                    where: { isPrimary: true, deleted: false, department: { deleted: false } },
                    select: { department: { select: { name: true } }, jobTitle: { select: { name: true, deleted: true } } },
                    take: 1,
                },
            },
        });

        return new Map( users.map( ( u ) => {
            const primary = u.departments[0];
            return [ u.id, {
                id: u.id,
                name: u.name,
                empNo: u.empNo,
                departmentName: primary?.department.name ?? null,
                positionName: u.position?.name ?? null,
                jobTitleName: primary?.jobTitle && !primary.jobTitle.deleted ? primary.jobTitle.name : null,
                usable: !u.deleted && u.status === UserStatus.ACTIVE && ( u.role === UserRole.USER || u.role === UserRole.ADMIN ),
            } ];
        }) );
    }

    //* 모두 결재자로 지정할 수 있는지 확인 → 결재자 정보 (지정 순서대로)
    async loadUsable( ids: number[], db: Prisma.TransactionClient | PrismaService = this.prisma ): Promise<ApproverInfo[]> {
        const map = await this.load( ids, db );

        const missing = ids.filter( ( id ) => !map.has( id ) );
        if ( missing.length > 0 ) {
            throw new BadRequestException( '존재하지 않는 회원이 결재자에 포함되어 있습니다.' );
        }

        const unusable = ids.map( ( id ) => map.get( id )! ).filter( ( a ) => !a.usable );
        if ( unusable.length > 0 ) {
            throw new BadRequestException( `결재자로 지정할 수 없는 회원이 있습니다(재직 중인 회원만 가능): ${unusable.map( ( a ) => a.name ).join( ', ' )}` );
        }

        return ids.map( ( id ) => map.get( id )! );
    }

    //* 문서 단계 스냅샷 컬럼
    static snapshot( a: ApproverInfo ) {
        return {
            approverName: a.name,
            departmentName: a.departmentName,
            positionName: a.positionName,
            jobTitleName: a.jobTitleName,
        };
    }
}
