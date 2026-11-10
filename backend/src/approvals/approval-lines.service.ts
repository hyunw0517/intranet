import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalLineScope, AuditTargetType, Prisma, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PrismaService } from "src/prisma/prisma.service";
import { ApproversService } from "./approvers.service";
import { ApprovalStepInputDto, CreateApprovalLineDto, ManageApprovalLineQueryDto, UpdateApprovalLineDto } from "./dto/approval-line.dto";
import { LineManagersService } from "./line-managers.service";
import { canManageLine, checkApproverIds } from "./util/approval-rules.util";

type Actor = Pick<Users, 'id' | 'role'>;

const lineSelect = {
    id: true, name: true, scope: true, departmentId: true, ownerUserId: true, updatedAt: true,
    department: { select: { id: true, name: true, deleted: true } },
    steps: { select: { approverId: true, stepOrder: true, name: true }, orderBy: { stepOrder: 'asc' } },
} satisfies Prisma.ApprovalLineTemplateSelect;

type LineRow = Prisma.ApprovalLineTemplateGetPayload<{ select: typeof lineSelect }>;

//! 결재라인 템플릿 (features.md 7.5, 2026-11-10 사용자 결정)
// - 상신 화면에서 결재자 목록을 채우는 "불러오기" 단축키. 불러온 뒤 문서에서 고칠 수 있고, 문서에는 사용한 템플릿 id만 남는다.
// - 공용(ADMIN)·부서(DEPARTMENT)는 결재라인 관리자, 개인(PERSONAL)은 본인이 만든다.
// - 불러오기: 공용은 전원, 부서는 그 부서 소속자(겸직 포함), 개인은 본인만. 남의 개인 결재라인은 관리자도 보지 않는다(404).
// - 템플릿에 든 회원이 삭제·퇴사해도 템플릿은 그대로 두고, 응답에 usable=false로 표시해 화면에서 빼고 상신하게 한다.
@Injectable()
export class ApprovalLinesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly approvers: ApproversService,
        private readonly lineManagers: LineManagersService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.APPROVAL_LINE );
    }

    //! 조회

    //* 내가 불러올 수 있는 템플릿 (공용 + 내 부서 + 내 개인)
    async findUsable( user: Actor ){
        const myDepartments = await this.prisma.userDepartment.findMany({
            where: { userId: user.id, deleted: false, department: { deleted: false } },
            select: { departmentId: true },
        });

        const rows = await this.prisma.approvalLineTemplate.findMany({
            where: {
                deleted: false,
                OR: [
                    { scope: ApprovalLineScope.ADMIN },
                    { scope: ApprovalLineScope.DEPARTMENT, departmentId: { in: myDepartments.map( ( d ) => d.departmentId ) }, department: { deleted: false } },
                    { scope: ApprovalLineScope.PERSONAL, ownerUserId: user.id },
                ],
            },
            select: lineSelect,
            orderBy: [ { scope: 'asc' }, { name: 'asc' }, { id: 'asc' } ],
        });

        return this.withApprovers( rows );
    }

    //* 내가 관리할 수 있는 공용·부서 템플릿 (결재라인 관리자, 권한이 없으면 403)
    // 삭제된 부서의 템플릿도 보여 준다(department.deleted) - 관리자가 직접 지울 수 있도록
    async findManageable( user: Actor, query: ManageApprovalLineQueryDto ){
        const scope = await this.lineManagers.manageScope( user );
        if ( !scope.all && scope.departmentIds.length === 0 ) {
            throw new ForbiddenException( '결재라인 관리 권한이 없습니다.' );
        }

        if ( query.scope === ApprovalLineScope.PERSONAL ) {
            throw new BadRequestException( '개인 결재라인은 관리 목록에서 조회하지 않습니다.' );
        }

        // 전체 관리자: 공용 + 모든 부서 / 부서 관리자: 맡은 부서의 부서 결재라인만 (공용 없음)
        const where: Prisma.ApprovalLineTemplateWhereInput = scope.all
            ? { deleted: false, scope: query.scope ?? { in: [ ApprovalLineScope.ADMIN, ApprovalLineScope.DEPARTMENT ] }, departmentId: query.departmentId }
            : {
                deleted: false,
                scope: query.scope === ApprovalLineScope.ADMIN ? { in: [] } : ApprovalLineScope.DEPARTMENT,
                departmentId: { in: scope.departmentIds.filter( ( id ) => query.departmentId === undefined || id === query.departmentId ) },
            };

        const rows = await this.prisma.approvalLineTemplate.findMany({
            where,
            select: lineSelect,
            orderBy: [ { scope: 'asc' }, { departmentId: 'asc' }, { name: 'asc' }, { id: 'asc' } ],
        });

        return { scope, lines: await this.withApprovers( rows ) };
    }

    //! 생성·수정·삭제

    async create( user: Actor, body: CreateApprovalLineDto ){
        const { scope } = body;

        if ( scope === ApprovalLineScope.DEPARTMENT ) {
            if ( body.departmentId === undefined ) {
                throw new BadRequestException( '부서 결재라인은 부서(departmentId)를 지정해야 합니다.' );
            }
            const department = await this.prisma.department.findFirst({ where: { id: body.departmentId, deleted: false } });
            if ( !department ) {
                throw new NotFoundException( '존재하지 않는 부서입니다.' );
            }
        } else if ( body.departmentId !== undefined ) {
            throw new BadRequestException( '부서 결재라인에만 부서를 지정합니다.' );
        }

        const target = {
            scope,
            departmentId: scope === ApprovalLineScope.DEPARTMENT ? body.departmentId! : null,
            ownerUserId: scope === ApprovalLineScope.PERSONAL ? user.id : null, // 개인 결재라인의 소유자는 항상 로그인 회원
        };
        if ( scope !== ApprovalLineScope.PERSONAL ) {
            await this.assertManageable( user, target );
        }

        await this.checkSteps( body.steps );

        return this.prisma.$transaction( async ( tx ) => {
            const line = await tx.approvalLineTemplate.create({
                data: {
                    name: body.name,
                    ...target,
                    createdId: user.id,
                    updatedId: user.id,
                    steps: { create: this.toStepRows( body.steps ) },
                },
                select: lineSelect,
            });

            await this.audit.created( tx, line.id, `결재라인 생성(${scope}): ${line.name}`, {
                scope, departmentId: target.departmentId, ownerUserId: target.ownerUserId, approverIds: body.steps.map( ( s ) => s.approverId ),
            });

            return ( await this.withApprovers( [ line ] ) )[0];
        });
    }

    async update( user: Actor, id: number, body: UpdateApprovalLineDto ){
        const line = await this.findEditable( user, id );

        if ( body.steps !== undefined ) {
            await this.checkSteps( body.steps );
        }

        return this.prisma.$transaction( async ( tx ) => {
            if ( body.steps !== undefined ) {
                await tx.approvalLineTemplateStep.deleteMany({ where: { approvalLineTemplateId: id } });
                await tx.approvalLineTemplateStep.createMany({
                    data: this.toStepRows( body.steps ).map( ( s ) => ({ ...s, approvalLineTemplateId: id }) ),
                });
            }

            const updated = await tx.approvalLineTemplate.update({
                where: { id },
                data: { name: body.name, updatedId: user.id },
                select: lineSelect,
            });

            await this.audit.updated( tx, id, `결재라인 수정: ${updated.name}`, diffChanges(
                { name: line.name, approverIds: line.steps.map( ( s ) => s.approverId ) },
                { name: updated.name, approverIds: updated.steps.map( ( s ) => s.approverId ) },
            ) );

            return ( await this.withApprovers( [ updated ] ) )[0];
        });
    }

    async delete( user: Actor, id: number ){
        const line = await this.findEditable( user, id );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.approvalLineTemplate.update({
                where: { id },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id, updatedId: user.id },
            });

            await this.audit.deleted( tx, id, `결재라인 삭제: ${line.name}` );
        });
    }

    //* 불러온 템플릿 id 확인 (결재 문서 저장 시) - 내가 불러올 수 있는 템플릿만 기록한다
    async assertUsableTemplate( user: Actor, id: number ){
        const usable = await this.findUsable( user );
        if ( !usable.some( ( l ) => l.id === id ) ) {
            throw new BadRequestException( '사용할 수 없는 결재라인입니다.' );
        }
    }

    //! 내부

    //* 수정·삭제할 수 있는 템플릿 (개인 = 본인만, 남의 개인은 404 / 공용·부서 = 관리 범위, 아니면 403)
    private async findEditable( user: Actor, id: number ): Promise<LineRow> {
        const line = await this.prisma.approvalLineTemplate.findFirst({ where: { id, deleted: false }, select: lineSelect });

        if ( !line || ( line.scope === ApprovalLineScope.PERSONAL && line.ownerUserId !== user.id ) ) {
            throw new NotFoundException( '존재하지 않는 결재라인입니다.' );
        }
        if ( line.scope !== ApprovalLineScope.PERSONAL ) {
            await this.assertManageable( user, line );
        }
        return line;
    }

    private async assertManageable( user: Actor, line: { scope: ApprovalLineScope; departmentId: number | null } ){
        const scope = await this.lineManagers.manageScope( user );
        if ( !canManageLine( scope, line ) ) {
            throw new ForbiddenException( '이 결재라인을 관리할 권한이 없습니다.' );
        }
    }

    // 템플릿 단계 검사: 1~10명, 중복 불가, 지정 가능한 회원 (기안자 본인 제외는 상신할 때만)
    private async checkSteps( steps: ApprovalStepInputDto[] ){
        const ids = steps.map( ( s ) => s.approverId );
        const error = checkApproverIds( ids, { minSteps: 1 } );
        if ( error ) throw new BadRequestException( error );
        await this.approvers.loadUsable( ids );
    }

    private toStepRows( steps: ApprovalStepInputDto[] ){
        return steps.map( ( s, i ) => ({ approverId: s.approverId, stepOrder: i + 1, name: s.name ?? null }) );
    }

    //* 단계마다 결재자의 현재 정보 + usable (삭제·퇴사한 결재자는 화면에서 빼고 상신)
    private async withApprovers( rows: LineRow[] ){
        const approvers = await this.approvers.load( rows.flatMap( ( l ) => l.steps.map( ( s ) => s.approverId ) ) );

        return rows.map( ( l ) => ({
            id: l.id,
            name: l.name,
            scope: l.scope,
            department: l.department,
            updatedAt: l.updatedAt,
            steps: l.steps.map( ( s ) => {
                const a = approvers.get( s.approverId );
                return {
                    stepOrder: s.stepOrder,
                    name: s.name,
                    approverId: s.approverId,
                    approverName: a?.name ?? null,
                    departmentName: a?.departmentName ?? null,
                    positionName: a?.positionName ?? null,
                    jobTitleName: a?.jobTitleName ?? null,
                    usable: a?.usable ?? false,
                };
            }),
        }) );
    }
}
