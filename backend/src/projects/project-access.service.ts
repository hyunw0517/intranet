import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AdminPermission, ProjectMemberRole, Users } from "src/generated/prisma/client";
import { hasAdminPermission } from "src/auth/util/admin-permission.util";
import { PrismaService } from "src/prisma/prisma.service";

export type ProjectActor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 한 프로젝트에 대한 요청자의 권한
export interface ProjectAccess {
    projectId: number;
    projectName: string;
    memberRole: ProjectMemberRole | null; // 활성 참여자가 아니면 NULL (관리자로 들어온 경우)
    isAdmin: boolean;                     // 과제 관리 관리자 (PROJECTS 기능)
    canManage: boolean;                   // 책임자 또는 관리자
}

//! 프로젝트 권한 판단 - 프로젝트 하위 API가 모두 먼저 호출한다.
// 열람은 활성 참여자와 과제 관리 관리자. 그 외에는 403, 없거나 삭제된 프로젝트는 404.
@Injectable()
export class ProjectAccessService {

    constructor(
        private readonly prisma: PrismaService,
    ){}

    isProjectAdmin( user: ProjectActor ): boolean {
        return hasAdminPermission( user, AdminPermission.PROJECTS );
    }

    //* 열람 권한 확인 (참여자 또는 관리자)
    async check( user: ProjectActor, projectId: number ): Promise<ProjectAccess> {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, deleted: false },
            select: {
                id: true,
                name: true,
                members: { where: { userId: user.id, deleted: false }, select: { role: true } },
            },
        });
        if ( !project ) {
            throw new NotFoundException( '존재하지 않는 프로젝트입니다.' );
        }

        const member = project.members[0] ?? null;
        const isAdmin = this.isProjectAdmin( user );
        if ( !member && !isAdmin ) {
            throw new ForbiddenException( '참여한 프로젝트만 볼 수 있습니다.' );
        }

        const isManager = member?.role === ProjectMemberRole.MANAGER;
        return {
            projectId: project.id,
            projectName: project.name,
            memberRole: member?.role ?? null,
            isAdmin,
            canManage: isManager || isAdmin,
        };
    }

    //* 관리 권한 확인 (책임자 또는 관리자)
    async checkManage( user: ProjectActor, projectId: number ): Promise<ProjectAccess> {
        const access = await this.check( user, projectId );
        if ( !access.canManage ) {
            throw new ForbiddenException( '프로젝트 책임자만 할 수 있습니다.' );
        }
        return access;
    }
}
