import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, Prisma, ProjectMemberRole, ProjectTaskStatus } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { PrismaService } from "src/prisma/prisma.service";
import { ProjectClientsService } from "./clients/project-clients.service";
import { CreateProjectDto, ProjectListQueryDto, toDateOnly, toEditorHtml, UpdateProjectDto } from "./dto/project.dto";
import { ProjectAccessService, ProjectActor } from "./project-access.service";
import { calcProgress } from "./util/project-rules.util";

const PERIOD_ERROR = '시작일은 종료일보다 늦을 수 없습니다.';

const clientSelect = { id: true, name: true, deleted: true } satisfies Prisma.ProjectClientSelect;

//! 프로젝트 (docs/design/projects.md 5장)
// - 생성: USER 이상 누구나, 만든 사람은 자동으로 책임자
// - 열람: 참여자 + 과제 관리 관리자(모든 프로젝트) / 수정·삭제: 책임자 + 관리자 / 복구: 관리자
// - 삭제는 soft delete. 과제·견적이 있어도 삭제할 수 있다.
@Injectable()
export class ProjectsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly clientsService: ProjectClientsService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT );
    }

    //* 목록 (scope=mine: 참여한 프로젝트, scope=all: 전체) + 책임자·진척도 + 내 참여 여부
    // 전체 목록은 USER 누구나 본다(2026-11-17 사용자 결정: 목록만 공개). 상세·과제·견적·매출 등은 여전히 참여자·관리자만(ProjectAccessService).
    // 그래서 목록에는 공개해도 되는 요약만 담는다 - 설명(description)은 빼고, 금액은 처음부터 넣지 않는다.
    async findAll( user: ProjectActor, query: ProjectListQueryDto ) {
        const keyword = query.search?.trim();
        const where: Prisma.ProjectWhereInput = {
            deleted: false,
            status: query.status,
            clientId: query.clientId,
            ...( keyword && { name: { contains: keyword, mode: 'insensitive' } } ),
            ...( query.scope === 'mine' && { members: { some: { userId: user.id, deleted: false } } } ),
        };

        const result = await PaginatePage( query,
            ( page ) => this.prisma.project.findMany({
                where,
                omit: { description: true }, // 공개 목록에 설명은 넣지 않는다 (상세에서만)
                include: {
                    client: { select: clientSelect },
                    members: {
                        where: { deleted: false, role: ProjectMemberRole.MANAGER },
                        select: { user: { select: { id: true, name: true } } },
                        orderBy: { id: 'asc' },
                    },
                    _count: { select: { members: { where: { deleted: false } } } },
                },
                orderBy: [ { id: query.order } ],
                ...page,
            }),
            () => this.prisma.project.count({ where }),
        );

        const ids = result.data.map( ( p ) => p.id );
        const [ progress, mine ] = await Promise.all([
            this.progressOf( ids ),
            this.prisma.projectMember.findMany({ where: { projectId: { in: ids }, userId: user.id, deleted: false }, select: { projectId: true } }),
        ]);
        const memberOf = new Set( mine.map( ( m ) => m.projectId ) );
        const isAdmin = this.access.isProjectAdmin( user );

        return {
            ...result,
            data: result.data.map( ( { members, _count, ...p } ) => ({
                ...p,
                managers: members.map( ( m ) => m.user ),
                memberCount: _count.members,
                progress: progress.get( p.id ) ?? { done: 0, total: 0, percent: 0 },
                isMember: memberOf.has( p.id ),
                canOpen: memberOf.has( p.id ) || isAdmin, // 상세에 들어갈 수 있는지 (화면이 링크를 걸지 정한다)
            }) ),
        };
    }

    //* 삭제된 프로젝트 (관리자, 복구용)
    findDeleted( query: ProjectListQueryDto ) {
        const where: Prisma.ProjectWhereInput = { deleted: true };
        return PaginatePage( query,
            ( page ) => this.prisma.project.findMany({
                where,
                include: { client: { select: clientSelect } },
                orderBy: [ { deletedAt: 'desc' }, { id: 'desc' } ],
                ...page,
            }),
            () => this.prisma.project.count({ where }),
        );
    }

    //* 상세 - 참여자 목록, 진척도, 상태별 과제 수, 내 권한(화면이 버튼을 보이고 숨기는 데 사용)
    async findOne( user: ProjectActor, id: number ) {
        const access = await this.access.check( user, id );

        const project = await this.prisma.project.findUniqueOrThrow({
            where: { id },
            include: {
                client: { select: clientSelect },
                members: {
                    where: { deleted: false },
                    select: {
                        id: true, role: true, createdAt: true,
                        user: { select: { id: true, name: true, status: true, deleted: true, position: { select: { name: true } } } },
                    },
                    orderBy: [ { role: 'asc' }, { id: 'asc' } ], // MANAGER가 먼저
                },
            },
        });

        const counts = await this.prisma.projectTask.groupBy({
            by: [ 'status' ],
            where: { projectId: id, deleted: false },
            _count: { _all: true },
        });
        const taskCounts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 } as Record<ProjectTaskStatus, number>;
        for ( const c of counts ) taskCounts[c.status] = c._count._all;
        const total = taskCounts.TODO + taskCounts.IN_PROGRESS + taskCounts.DONE;

        return {
            ...project,
            taskCounts,
            progress: { done: taskCounts.DONE, total, percent: calcProgress( taskCounts.DONE, total ) },
            myAccess: {
                memberRole: access.memberRole,
                isAdmin: access.isAdmin,
                canManage: access.canManage,
            },
        };
    }

    //* 생성 - 만든 사람을 책임자로 함께 등록 (같은 트랜잭션)
    async create( user: ProjectActor, body: CreateProjectDto ) {
        this.assertPeriod( body.startDate, body.endDate );
        if ( body.clientId ) {
            await this.clientsService.findActive( body.clientId );
        }

        return this.prisma.$transaction( async ( tx ) => {
            const project = await tx.project.create({
                data: {
                    name: body.name,
                    description: toEditorHtml( body.description ),
                    status: body.status,
                    startDate: toDateOnly( body.startDate ),
                    endDate: toDateOnly( body.endDate ),
                    clientId: body.clientId,
                    createdId: user.id,
                    updatedId: user.id,
                    members: {
                        create: { userId: user.id, role: ProjectMemberRole.MANAGER, createdId: user.id, updatedId: user.id },
                    },
                },
            });

            await this.audit.created( tx, project.id, `프로젝트 생성: ${project.name}`, { status: project.status, clientId: project.clientId } );

            return project;
        });
    }

    //* 수정 (책임자·관리자)
    async update( user: ProjectActor, id: number, body: UpdateProjectDto ) {
        await this.access.checkManage( user, id );
        const before = await this.prisma.project.findUniqueOrThrow({ where: { id } });

        // 한쪽만 보내도 저장된 다른 쪽과 비교한다
        const startDate = body.startDate !== undefined ? body.startDate : before.startDate?.toISOString().slice( 0, 10 ) ?? null;
        const endDate = body.endDate !== undefined ? body.endDate : before.endDate?.toISOString().slice( 0, 10 ) ?? null;
        this.assertPeriod( startDate, endDate );

        // 거래처를 바꿀 때만 삭제 여부를 본다 (이미 연결된 삭제된 거래처는 그대로 둘 수 있다)
        if ( body.clientId && body.clientId !== before.clientId ) {
            await this.clientsService.findActive( body.clientId );
        }

        const data = {
            name: body.name,
            description: toEditorHtml( body.description ),
            status: body.status,
            startDate: toDateOnly( body.startDate ),
            endDate: toDateOnly( body.endDate ),
            clientId: body.clientId,
        };

        return this.prisma.$transaction( async ( tx ) => {
            const project = await tx.project.update({
                where: { id, deleted: false },
                data: { ...data, updatedId: user.id },
            });
            await this.audit.updated( tx, id, `프로젝트 수정: ${project.name}`, diffChanges( before, data ) );
            return project;
        });
    }

    //* 삭제 (책임자·관리자, soft delete)
    async delete( user: ProjectActor, id: number ) {
        const access = await this.access.checkManage( user, id );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.project.update({
                where: { id, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.audit.deleted( tx, id, `프로젝트 삭제: ${access.projectName}` );
        });

        return true;
    }

    //* 복구 (관리자, 2026-11-17 사용자 결정)
    async restore( user: ProjectActor, id: number ) {
        const project = await this.prisma.project.findFirst({ where: { id, deleted: true } });
        if ( !project ) {
            throw new NotFoundException( '삭제된 프로젝트가 아닙니다.' );
        }

        return this.prisma.$transaction( async ( tx ) => {
            const restored = await tx.project.update({
                where: { id, deleted: true },
                data: { deleted: false, deletedAt: null, deletedId: null, updatedId: user.id },
            });
            await this.audit.log( { targetId: id, actionType: AuditActionType.RESTORE, content: `프로젝트 복구: ${restored.name}` }, tx );
            return restored;
        });
    }

    //* 프로젝트별 진척도 (목록 한 페이지 분량을 한 번에)
    private async progressOf( projectIds: number[] ) {
        const map = new Map<number, { done: number; total: number; percent: number }>();
        if ( projectIds.length === 0 ) return map;

        const rows = await this.prisma.projectTask.groupBy({
            by: [ 'projectId', 'status' ],
            where: { projectId: { in: projectIds }, deleted: false },
            _count: { _all: true },
        });

        for ( const id of projectIds ) {
            const mine = rows.filter( ( r ) => r.projectId === id );
            const total = mine.reduce( ( sum, r ) => sum + r._count._all, 0 );
            const done = mine.find( ( r ) => r.status === ProjectTaskStatus.DONE )?._count._all ?? 0;
            map.set( id, { done, total, percent: calcProgress( done, total ) } );
        }
        return map;
    }

    // 둘 다 있으면 시작 <= 종료 (DB CHECK 제약 project_model_period_check와 같은 규칙, 친절한 400 메시지용)
    private assertPeriod( start: string | null | undefined, end: string | null | undefined ) {
        if ( start && end && start > end ) {
            throw new BadRequestException( PERIOD_ERROR );
        }
    }
}
