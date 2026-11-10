import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalLineManagerScope, AuditTargetType, UserRole, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateLineManagerDto } from "./dto/line-manager.dto";
import { LineManageScope, resolveManageScope } from "./util/approval-rules.util";

type Actor = Pick<Users, 'id' | 'role'>;

const SCOPE_LABEL: Record<ApprovalLineManagerScope, string> = {
    ALL: '전체',
    DEPARTMENT: '특정 부서',
    MY_DEPARTMENT: '본인 부서',
};

//! 결재라인 관리자 (Role.ADMIN과 별개 위임 권한, features.md 7.5, 2026-11-10 사용자 결정)
// - ADMIN이 규칙을 등록·해제한다. ADMIN은 규칙 없이도 항상 전체를 관리한다.
// - 한 행 = 대상 1개(회원 / 직책) + 범위(ALL / DEPARTMENT / MY_DEPARTMENT)
// - 토큰에 넣지 않고 요청마다 DB로 판정한다 → 지정·해제가 즉시 반영된다. (게시판 권한과 같은 방식)
// - 삭제된 부서·직책을 쓰는 규칙은 판정에서 무시하고, 목록에는 표시만 해서 관리자가 지우게 한다. (핵심 삭제를 막지 않음)
@Injectable()
export class LineManagersService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.APPROVAL_LINE_MANAGER );
    }

    //* 내 관리 범위
    async manageScope( user: Actor ): Promise<LineManageScope> {
        if ( user.role === UserRole.ADMIN ) {
            return { all: true, departmentIds: [] };
        }

        // 내 소속 (삭제 안 된 부서·직책만) → 직책 id별 부서 id
        const affiliations = await this.prisma.userDepartment.findMany({
            where: { userId: user.id, deleted: false, department: { deleted: false }, jobTitleId: { not: null }, jobTitle: { deleted: false } },
            select: { departmentId: true, jobTitleId: true },
        });
        const byJobTitle = new Map<number, number[]>();
        for ( const a of affiliations ) {
            byJobTitle.set( a.jobTitleId!, [ ...( byJobTitle.get( a.jobTitleId! ) ?? [] ), a.departmentId ] );
        }

        const rules = await this.prisma.approvalLineManager.findMany({
            where: {
                deleted: false,
                OR: [
                    { userId: user.id },
                    ...( byJobTitle.size > 0 ? [ { jobTitleId: { in: [ ...byJobTitle.keys() ] }, jobTitle: { deleted: false } } ] : [] ),
                ],
                // 범위가 특정 부서면 그 부서가 살아 있어야 한다
                NOT: { scope: ApprovalLineManagerScope.DEPARTMENT, department: { deleted: true } },
            },
            select: { scope: true, jobTitleId: true, departmentId: true },
        });

        return resolveManageScope( rules, byJobTitle );
    }

    //* 내 관리 범위 + 관리할 수 있는 부서 이름 (화면용, 전체 관리자는 삭제 안 된 모든 부서)
    async myScope( user: Actor ){
        const scope = await this.manageScope( user );
        const departments = scope.all || scope.departmentIds.length > 0
            ? await this.prisma.department.findMany({
                where: { deleted: false, ...( !scope.all && { id: { in: scope.departmentIds } } ) },
                select: { id: true, name: true, parentDepartmentId: true, sortOrder: true },
                orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
            })
            : [];
        return { ...scope, departments };
    }

    //* 규칙 목록 (ADMIN) - 삭제된 대상·부서는 화면에서 "(삭제됨)"으로 표시하도록 상태를 함께 준다
    async findAll(){
        const rows = await this.prisma.approvalLineManager.findMany({
            where: { deleted: false },
            select: {
                id: true, scope: true, createdAt: true,
                user: { select: { id: true, name: true, empNo: true, status: true, deleted: true } },
                jobTitle: { select: { id: true, name: true, deleted: true } },
                department: { select: { id: true, name: true, deleted: true } },
            },
            orderBy: [ { id: 'asc' } ],
        });

        return rows.map( ( r ) => ({
            ...r,
            // 판정에 쓰이지 않는 규칙 (대상 회원 삭제·퇴사 / 직책·부서 삭제)
            inactive: ( r.user !== null && ( r.user.deleted || r.user.status !== 'ACTIVE' ) )
                || ( r.jobTitle?.deleted ?? false )
                || ( r.department?.deleted ?? false ),
        }) );
    }

    //* 규칙 등록 (ADMIN)
    async create( user: Actor, body: CreateLineManagerDto ){
        const { userId, jobTitleId, scope, departmentId } = body;

        if ( ( userId === undefined ) === ( jobTitleId === undefined ) ) {
            throw new BadRequestException( '대상은 회원(userId)과 직책(jobTitleId) 중 하나만 지정해야 합니다.' );
        }
        if ( ( scope === ApprovalLineManagerScope.DEPARTMENT ) !== ( departmentId !== undefined ) ) {
            throw new BadRequestException( '범위가 특정 부서일 때만 부서(departmentId)를 지정합니다.' );
        }
        if ( scope === ApprovalLineManagerScope.MY_DEPARTMENT && jobTitleId === undefined ) {
            throw new BadRequestException( '본인 부서 범위는 직책 대상에만 쓸 수 있습니다.' );
        }

        let targetLabel: string;
        if ( userId !== undefined ) {
            const target = await this.prisma.users.findFirst({ where: { id: userId, deleted: false }, select: { name: true, role: true } });
            if ( !target || target.role === UserRole.GUEST ) {
                throw new NotFoundException( '존재하지 않거나 승인되지 않은 회원입니다.' );
            }
            targetLabel = `회원 ${target.name}`;
        } else {
            const target = await this.prisma.jobTitle.findFirst({ where: { id: jobTitleId, deleted: false }, select: { name: true } });
            if ( !target ) {
                throw new NotFoundException( '존재하지 않는 직책입니다.' );
            }
            targetLabel = `직책 ${target.name}`;
        }

        let scopeLabel = SCOPE_LABEL[scope];
        if ( departmentId !== undefined ) {
            const department = await this.prisma.department.findFirst({ where: { id: departmentId, deleted: false }, select: { name: true } });
            if ( !department ) {
                throw new NotFoundException( '존재하지 않는 부서입니다.' );
            }
            scopeLabel = `부서 ${department.name}`;
        }

        const duplicate = await this.prisma.approvalLineManager.count({
            where: { userId: userId ?? null, jobTitleId: jobTitleId ?? null, scope, departmentId: departmentId ?? null, deleted: false },
        });
        if ( duplicate > 0 ) {
            throw new ConflictException( '같은 규칙이 이미 있습니다.' );
        }

        return this.prisma.$transaction( async ( tx ) => {
            const rule = await tx.approvalLineManager.create({
                data: {
                    userId: userId ?? null,
                    jobTitleId: jobTitleId ?? null,
                    scope,
                    departmentId: departmentId ?? null,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });

            await this.audit.created( tx, rule.id, `결재라인 관리자 지정: ${targetLabel} → ${scopeLabel}`, { userId, jobTitleId, scope, departmentId } );

            return rule;
        });
    }

    //* 규칙 해제 (ADMIN) - 수정은 없다 (해제 후 다시 등록)
    async delete( user: Actor, id: number ){
        const rule = await this.prisma.approvalLineManager.findFirst({ where: { id, deleted: false } });
        if ( !rule ) {
            throw new NotFoundException( '존재하지 않는 규칙입니다.' );
        }

        await this.prisma.$transaction( async ( tx ) => {
            await tx.approvalLineManager.update({
                where: { id },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id, updatedId: user.id },
            });

            await this.audit.deleted( tx, id, `결재라인 관리자 해제 (규칙 ${id})`, {
                userId: rule.userId, jobTitleId: rule.jobTitleId, scope: rule.scope, departmentId: rule.departmentId,
            });
        });
    }
}
