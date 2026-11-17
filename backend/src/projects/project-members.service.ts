import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, Prisma, ProjectMemberRole, UserRole, UserStatus } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PrismaService } from "src/prisma/prisma.service";
import { AddProjectMemberDto, UpdateProjectMemberDto } from "./dto/project.dto";
import { ProjectAccessService, ProjectActor } from "./project-access.service";
import { ProjectNotifier } from "./project-notifier";

const LAST_MANAGER_ERROR = '책임자는 최소 한 명 있어야 합니다.';

//! 프로젝트 참여자 (책임자·관리자만 관리, docs/design/projects.md 5장)
// - 빼면 soft delete(참여 이력 보존), 다시 넣으면 새 행. 활성 참여자 중복은 DB 부분 unique가 막는다.
// - 빠진 참여자가 담당인 과제는 담당자를 그대로 둔다("담당자 부재", 과제 서비스가 판단).
// - ⭐ 마지막 책임자는 빼거나 참여자로 바꿀 수 없다. 두 책임자가 동시에 서로를 바꾸는 경우를 막으려고
//   그 프로젝트의 책임자 행을 FOR UPDATE로 잠근 뒤 센다. (마지막 슈퍼관리자 보호와 같은 방식, features.md 5.1)
@Injectable()
export class ProjectMembersService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly notifier: ProjectNotifier,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_MEMBER );
    }

    //* 참여자 추가 - 재직 중인 승인 회원만
    async add( user: ProjectActor, projectId: number, body: AddProjectMemberDto ) {
        const access = await this.access.checkManage( user, projectId );

        const target = await this.prisma.users.findFirst({
            where: { id: body.userId, deleted: false, status: UserStatus.ACTIVE, role: { not: UserRole.GUEST } },
            select: { id: true, name: true },
        });
        if ( !target ) {
            throw new BadRequestException( '재직 중인 회원만 참여자로 추가할 수 있습니다.' );
        }

        const member = await this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const created = await tx.projectMember.create({
                data: {
                    projectId,
                    userId: target.id,
                    role: body.role,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });
            await this.audit.created( tx, created.id, `프로젝트 참여자 추가: ${access.projectName} - ${target.name}`,
                { projectId, userId: target.id, role: created.role } );
            return created;
        }) );

        await this.notifier.memberAdded( { id: projectId, name: access.projectName }, [ target.id ] );

        return member;
    }

    //* 역할 수정 - 책임자 → 참여자로 바꿀 때 마지막 책임자 확인
    async update( user: ProjectActor, projectId: number, memberId: number, body: UpdateProjectMemberDto ) {
        const access = await this.access.checkManage( user, projectId );
        const before = await this.findMember( projectId, memberId );

        const data = { role: body.role };

        return this.prisma.$transaction( async ( tx ) => {
            if ( before.role === ProjectMemberRole.MANAGER && body.role === ProjectMemberRole.MEMBER ) {
                await this.assertNotLastManager( tx, projectId, memberId );
            }

            const member = await tx.projectMember.update({
                where: { id: memberId, deleted: false },
                data: { ...data, updatedId: user.id },
            });
            await this.audit.updated( tx, memberId, `프로젝트 참여자 수정: ${access.projectName} - ${before.user.name}`,
                diffChanges( before, data ), { projectId, userId: before.userId } );
            return member;
        });
    }

    //* 참여자 빼기 (soft delete) - 책임자를 뺄 때 마지막 책임자 확인
    async remove( user: ProjectActor, projectId: number, memberId: number ) {
        const access = await this.access.checkManage( user, projectId );
        const member = await this.findMember( projectId, memberId );

        await this.prisma.$transaction( async ( tx ) => {
            if ( member.role === ProjectMemberRole.MANAGER ) {
                await this.assertNotLastManager( tx, projectId, memberId );
            }

            await tx.projectMember.update({
                where: { id: memberId, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            await this.audit.deleted( tx, memberId, `프로젝트 참여자 제외: ${access.projectName} - ${member.user.name}`,
                { projectId, userId: member.userId } );
        });

        return true;
    }

    // ⭐ 책임자 행을 잠근 뒤 센다. 먼저 잠근 쪽이 커밋하면, 기다리던 쪽은 바뀐 행(이미 참여자·삭제)을 제외하고 다시 읽는다(READ COMMITTED).
    private async assertNotLastManager( tx: Prisma.TransactionClient, projectId: number, memberId: number ) {
        const managers = await tx.$queryRaw<{ id: number }[]>`
            SELECT id FROM project_member_model
            WHERE project_id = ${projectId} AND role = 'MANAGER'::"ProjectMemberRole" AND deleted = false
            FOR UPDATE
        `;
        const others = managers.filter( ( m ) => m.id !== memberId );
        if ( others.length === 0 ) {
            throw new BadRequestException( LAST_MANAGER_ERROR );
        }
    }

    private async findMember( projectId: number, memberId: number ) {
        const member = await this.prisma.projectMember.findFirst({
            where: { id: memberId, projectId, deleted: false },
            include: { user: { select: { name: true } } },
        });
        if ( !member ) {
            throw new NotFoundException( '이 프로젝트의 참여자가 아닙니다.' );
        }
        return member;
    }

    private async withDuplicateGuard<T>( fn: () => Promise<T> ): Promise<T> {
        try {
            return await fn();
        } catch ( e ) {
            if ( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ) {
                throw new ConflictException( '이미 참여 중인 회원입니다.' );
            }
            throw e;
        }
    }
}
