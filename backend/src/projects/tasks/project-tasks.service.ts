import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { AuditTargetType, Prisma, ProjectTaskStatus, UserStatus } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { addKstDays, kstDateString } from "src/common/util/date.util";
import { PrismaService } from "src/prisma/prisma.service";
import { toDateOnly, toEditorHtml } from "../dto/project.dto";
import { CreateProjectTaskDto, MoveProjectTaskDto, UpdateProjectTaskDto } from "../dto/project-task.dto";
import { ProjectAccess, ProjectAccessService, ProjectActor } from "../project-access.service";
import { ProjectNotifier } from "../project-notifier";
import { isAssigneeAbsent, reorderColumn, TASK_STATUS_ORDER } from "../util/project-rules.util";

const assigneeSelect = { id: true, name: true, status: true, deleted: true } satisfies Prisma.UsersSelect;

//! 과제 (칸반 카드)
// - 참여자 누구나 생성·수정·이동·삭제(soft delete).
// - 담당자는 현재 참여자만. 참여자가 빠지면 값은 두고 "담당자 부재"로 표시하고, 교체는 책임자·관리자만 한다.
// - 순서는 컬럼 안의 정수 sortOrder. 생성·이동은 프로젝트 행을 FOR UPDATE로 잠그고 컬럼을 다시 번호 매긴다.
@Injectable()
export class ProjectTasksService {

    private readonly logger = new Logger( ProjectTasksService.name );
    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly notifier: ProjectNotifier,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_TASK );
    }

    //* 칸반 목록 (컬럼 순서 → sortOrder) + 담당자 부재 여부
    async findAll( user: ProjectActor, projectId: number ) {
        await this.access.check( user, projectId );

        const [ tasks, memberIds ] = await Promise.all([
            this.prisma.projectTask.findMany({
                where: { projectId, deleted: false },
                include: { assignee: { select: assigneeSelect } },
                orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
            }),
            this.activeMemberIds( projectId ),
        ]);

        return TASK_STATUS_ORDER.flatMap( ( status ) => tasks.filter( ( t ) => t.status === status ) )
            .map( ( t ) => ({ ...t, assigneeAbsent: isAssigneeAbsent( t.assignee, memberIds ) }) );
    }

    //* 내 할 일 - 내가 담당인 미완료 과제 (참여 중인 프로젝트만, 마감일 가까운 순)
    findMine( user: ProjectActor ) {
        return this.prisma.projectTask.findMany({
            where: {
                assigneeId: user.id,
                deleted: false,
                status: { not: ProjectTaskStatus.DONE },
                project: { deleted: false, members: { some: { userId: user.id, deleted: false } } },
            },
            include: { project: { select: { id: true, name: true } } },
            orderBy: [ { dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' } ],
        });
    }

    //* 생성 - 들어갈 컬럼의 맨 아래
    async create( user: ProjectActor, projectId: number, body: CreateProjectTaskDto ) {
        const access = await this.access.check( user, projectId );
        if ( body.assigneeId ) {
            await this.assertAssignable( projectId, body.assigneeId );
        }
        const status = body.status ?? ProjectTaskStatus.TODO;

        const task = await this.prisma.$transaction( async ( tx ) => {
            await this.lockProject( tx, projectId );

            const last = await tx.projectTask.findFirst({
                where: { projectId, status, deleted: false },
                orderBy: { sortOrder: 'desc' },
                select: { sortOrder: true },
            });

            const created = await tx.projectTask.create({
                data: {
                    projectId,
                    title: body.title,
                    description: toEditorHtml( body.description ),
                    status,
                    assigneeId: body.assigneeId,
                    dueDate: toDateOnly( body.dueDate ),
                    sortOrder: ( last?.sortOrder ?? -1 ) + 1,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });
            await this.audit.created( tx, created.id, `과제 생성: [${access.projectName}] ${created.title}`,
                { projectId, status, assigneeId: created.assigneeId } );
            return created;
        });

        if ( task.assigneeId ) {
            await this.notifier.taskAssigned( { id: projectId, name: access.projectName }, task, task.assigneeId );
        }
        return task;
    }

    //* 수정 (새 담당자는 현재 참여자, 지금 담당자가 부재면 책임자·관리자만 바꾼다)
    async update( user: ProjectActor, projectId: number, taskId: number, body: UpdateProjectTaskDto ) {
        const access = await this.access.check( user, projectId );
        const before = await this.findTask( projectId, taskId );

        const assigneeChanged = body.assigneeId !== undefined && body.assigneeId !== before.assigneeId;
        if ( assigneeChanged ) {
            await this.assertCanChangeAssignee( access, before );
            if ( body.assigneeId ) {
                await this.assertAssignable( projectId, body.assigneeId );
            }
        }

        const data = {
            title: body.title,
            description: toEditorHtml( body.description ),
            assigneeId: body.assigneeId,
            dueDate: toDateOnly( body.dueDate ),
        };

        const task = await this.prisma.$transaction( async ( tx ) => {
            const updated = await tx.projectTask.update({
                where: { id: taskId, deleted: false },
                data: { ...data, updatedId: user.id },
            });
            await this.audit.updated( tx, taskId, `과제 수정: [${access.projectName}] ${updated.title}`, diffChanges( before, data ), { projectId } );
            return updated;
        });

        if ( assigneeChanged && task.assigneeId ) {
            await this.notifier.taskAssigned( { id: projectId, name: access.projectName }, task, task.assigneeId );
        }
        return task;
    }

    //* 칸반 이동 - 옮길 컬럼을 다시 번호 매기고, 다른 컬럼에서 왔으면 원래 컬럼도 다시 매긴다
    async move( user: ProjectActor, projectId: number, taskId: number, body: MoveProjectTaskDto ) {
        const access = await this.access.check( user, projectId );

        return this.prisma.$transaction( async ( tx ) => {
            await this.lockProject( tx, projectId );

            // 잠근 뒤에 읽는다 (잠그기 전에 읽은 상태는 다른 요청이 바꿨을 수 있다)
            const task = await tx.projectTask.findFirst({ where: { id: taskId, projectId, deleted: false } });
            if ( !task ) {
                throw new NotFoundException( '존재하지 않는 과제입니다.' );
            }

            const column = await tx.projectTask.findMany({
                where: { projectId, status: body.status, deleted: false },
                orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
                select: { id: true },
            });
            const order = reorderColumn( column.map( ( t ) => t.id ), taskId, body.index );
            await this.renumber( tx, order, user.id, { id: taskId, status: body.status } );

            if ( task.status !== body.status ) {
                const source = await tx.projectTask.findMany({
                    where: { projectId, status: task.status, deleted: false },
                    orderBy: [ { sortOrder: 'asc' }, { id: 'asc' } ],
                    select: { id: true },
                });
                await this.renumber( tx, source.map( ( t ) => t.id ), user.id );

                // 순서만 바뀐 이동은 기록하지 않는다(드래그마다 쌓이지 않게). 상태가 바뀐 경우만.
                await this.audit.updated( tx, taskId, `과제 상태 변경: [${access.projectName}] ${task.title}`,
                    { status: { before: task.status, after: body.status } }, { projectId } );
            }

            return tx.projectTask.findUniqueOrThrow({ where: { id: taskId } });
        });
    }

    //* 삭제 (soft delete, 남은 번호는 그대로 두고 다음 이동 때 다시 매긴다)
    async delete( user: ProjectActor, projectId: number, taskId: number ) {
        const access = await this.access.check( user, projectId );
        const task = await this.findTask( projectId, taskId );

        await this.prisma.$transaction( async ( tx ) => {
            await tx.projectTask.update({
                where: { id: taskId, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.audit.deleted( tx, taskId, `과제 삭제: [${access.projectName}] ${task.title}`, { projectId } );
        });

        return true;
    }

    //* 마감 임박 알림 - 매일 09:00(KST), 내일 마감인 미완료 과제의 담당자에게 (부재 담당자 제외)
    @Cron( '0 0 9 * * *', { name: 'project-task-due-soon', timeZone: 'Asia/Seoul' } )
    async notifyDueSoon() {
        const tomorrow = addKstDays( kstDateString( new Date() ), 1 );

        const tasks = await this.prisma.projectTask.findMany({
            where: {
                dueDate: toDateOnly( tomorrow ),
                status: { not: ProjectTaskStatus.DONE },
                deleted: false,
                assigneeId: { not: null },
                project: { deleted: false },
            },
            include: {
                assignee: { select: assigneeSelect },
                project: { select: { id: true, name: true, members: { where: { deleted: false }, select: { userId: true } } } },
            },
        });

        const targets = tasks
            .filter( ( t ) => !isAssigneeAbsent( t.assignee, new Set( t.project.members.map( ( m ) => m.userId ) ) ) )
            .map( ( t ) => ({ id: t.id, title: t.title, assigneeId: t.assigneeId as number, project: { id: t.project.id, name: t.project.name } }) );

        this.logger.log( `마감 임박 과제 알림: ${targets.length}건 (${tomorrow} 마감)` );
        await this.notifier.taskDueSoon( targets );
        return targets.length;
    }

    //! 내부

    private async lockProject( tx: Prisma.TransactionClient, projectId: number ) {
        await tx.$queryRaw`SELECT id FROM project_model WHERE id = ${projectId} FOR UPDATE`;
    }

    // 0부터 다시 매긴다. moved가 있으면 그 과제의 상태도 함께 바꾼다.
    private async renumber( tx: Prisma.TransactionClient, ids: number[], userId: number, moved?: { id: number; status: ProjectTaskStatus } ) {
        for ( const [ sortOrder, id ] of ids.entries() ) {
            await tx.projectTask.update({
                where: { id },
                data: id === moved?.id ? { sortOrder, status: moved.status, updatedId: userId } : { sortOrder },
            });
        }
    }

    private async findTask( projectId: number, taskId: number ) {
        const task = await this.prisma.projectTask.findFirst({
            where: { id: taskId, projectId, deleted: false },
            include: { assignee: { select: assigneeSelect } },
        });
        if ( !task ) {
            throw new NotFoundException( '존재하지 않는 과제입니다.' );
        }
        return task;
    }

    private async activeMemberIds( projectId: number ) {
        const members = await this.prisma.projectMember.findMany({ where: { projectId, deleted: false }, select: { userId: true } });
        return new Set( members.map( ( m ) => m.userId ) );
    }

    // 담당자로 지정할 수 있는 사람: 현재 참여자 + 재직(퇴사·삭제 아님)
    private async assertAssignable( projectId: number, userId: number ) {
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, userId, deleted: false, user: { deleted: false, status: { not: UserStatus.RESIGNED } } },
        });
        if ( !member ) {
            throw new BadRequestException( '프로젝트 참여자만 담당자로 지정할 수 있습니다.' );
        }
    }

    // 지금 담당자가 부재면 책임자·관리자만 바꾼다
    private async assertCanChangeAssignee( access: ProjectAccess, task: { assignee: { id: number; status: UserStatus; deleted: boolean } | null; projectId: number } ) {
        if ( access.canManage ) return;
        const absent = isAssigneeAbsent( task.assignee, await this.activeMemberIds( task.projectId ) );
        if ( absent ) {
            throw new ForbiddenException( '담당자가 부재인 과제는 책임자만 담당자를 바꿀 수 있습니다.' );
        }
    }
}
