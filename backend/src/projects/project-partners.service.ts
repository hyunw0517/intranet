import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, Prisma } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PrismaService } from "src/prisma/prisma.service";
import { ProjectClientsService } from "./clients/project-clients.service";
import { toDateOnly } from "./dto/project.dto";
import { CreateProjectPartnerDto, UpdateProjectPartnerDto } from "./dto/project-partner.dto";
import { ProjectAccessService, ProjectActor } from "./project-access.service";

const PERIOD_ERROR = '계약 시작일은 종료일보다 늦을 수 없습니다.';

const partnerInclude = {
    client: { select: { id: true, name: true, businessNo: true, deleted: true } },
} satisfies Prisma.ProjectPartnerInclude;

//! 프로젝트 협력사 (하청기업, docs/design/projects.md "협력사", 2026-11-17 사용자 결정)
// - 발주처(Project.clientId, 돈을 받는 쪽)와 반대로 우리가 돈을 주는 쪽. 한 프로젝트에 여러 개.
// - 참여자 누구나 등록·수정·빼기. 금액도 참여자 전원이 본다(금액 열람 규칙 없음).
// - 빼면 soft delete(예산 집행·매입 세금계산서가 연결될 예정이라 기록 유지). 같은 회사는 활성 한 행(DB 부분 unique).
@Injectable()
export class ProjectPartnersService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly clientsService: ProjectClientsService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_PARTNER );
    }

    //* 협력사 목록 (추가한 순서)
    async findAll( user: ProjectActor, projectId: number ) {
        await this.access.check( user, projectId );
        return this.prisma.projectPartner.findMany({
            where: { projectId, deleted: false },
            include: partnerInclude,
            orderBy: { id: 'asc' },
        });
    }

    //* 추가 - 삭제되지 않은 거래처만 새로 연결할 수 있다
    async create( user: ProjectActor, projectId: number, body: CreateProjectPartnerDto ) {
        const access = await this.access.check( user, projectId );
        const client = await this.clientsService.findActive( body.clientId );
        this.assertPeriod( body.startDate, body.endDate );

        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const partner = await tx.projectPartner.create({
                data: {
                    projectId,
                    clientId: client.id,
                    workScope: body.workScope,
                    contractAmount: body.contractAmount,
                    startDate: toDateOnly( body.startDate ),
                    endDate: toDateOnly( body.endDate ),
                    contactName: body.contactName,
                    contactHp: body.contactHp,
                    contactEmail: body.contactEmail,
                    createdId: user.id,
                    updatedId: user.id,
                },
                include: partnerInclude,
            });
            await this.audit.created( tx, partner.id, `협력사 추가: [${access.projectName}] ${client.name}`,
                { projectId, clientId: client.id, contractAmount: body.contractAmount ?? null } );
            return partner;
        }) );
    }

    //* 수정 (보낸 항목만) - 한쪽 날짜만 보내도 저장된 다른 쪽과 비교한다
    async update( user: ProjectActor, projectId: number, partnerId: number, body: UpdateProjectPartnerDto ) {
        const access = await this.access.check( user, projectId );
        const before = await this.findPartner( projectId, partnerId );

        const startDate = body.startDate !== undefined ? body.startDate : before.startDate?.toISOString().slice( 0, 10 ) ?? null;
        const endDate = body.endDate !== undefined ? body.endDate : before.endDate?.toISOString().slice( 0, 10 ) ?? null;
        this.assertPeriod( startDate, endDate );

        const data = {
            workScope: body.workScope,
            contractAmount: body.contractAmount,
            startDate: toDateOnly( body.startDate ),
            endDate: toDateOnly( body.endDate ),
            contactName: body.contactName,
            contactHp: body.contactHp,
            contactEmail: body.contactEmail,
        };

        return this.prisma.$transaction( async ( tx ) => {
            const partner = await tx.projectPartner.update({
                where: { id: partnerId, deleted: false },
                data: { ...data, updatedId: user.id },
                include: partnerInclude,
            });
            await this.audit.updated( tx, partnerId, `협력사 수정: [${access.projectName}] ${partner.client.name}`,
                diffChanges( { ...before, contractAmount: before.contractAmount?.toString() ?? null }, { ...data, contractAmount: data.contractAmount === undefined ? undefined : data.contractAmount?.toString() ?? null } ),
                { projectId } );
            return partner;
        });
    }

    //* 빼기 (soft delete)
    async remove( user: ProjectActor, projectId: number, partnerId: number ) {
        const access = await this.access.check( user, projectId );
        const partner = await this.findPartner( projectId, partnerId );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.projectPartner.update({
                where: { id: partnerId, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.audit.deleted( tx, partnerId, `협력사 제외: [${access.projectName}] ${partner.client.name}`, { projectId, clientId: partner.clientId } );
        });

        return true;
    }

    private async findPartner( projectId: number, partnerId: number ) {
        const partner = await this.prisma.projectPartner.findFirst({
            where: { id: partnerId, projectId, deleted: false },
            include: partnerInclude,
        });
        if ( !partner ) {
            throw new NotFoundException( '이 프로젝트의 협력사가 아닙니다.' );
        }
        return partner;
    }

    // DB CHECK 제약 project_partner_model_period_check와 같은 규칙 (친절한 400 메시지용)
    private assertPeriod( start: string | null | undefined, end: string | null | undefined ) {
        if ( start && end && start > end ) {
            throw new BadRequestException( PERIOD_ERROR );
        }
    }

    private async withDuplicateGuard<T>( fn: () => Promise<T> ): Promise<T> {
        try {
            return await fn();
        } catch ( e ) {
            if ( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ) {
                throw new ConflictException( '이미 이 프로젝트의 협력사로 등록된 거래처입니다.' );
            }
            throw e;
        }
    }
}
