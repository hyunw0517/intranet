import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, Prisma } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ProjectActor } from "../project-access.service";
import { SaveBudgetCategoryDto } from "./dto/project-budget.dto";

const DUPLICATE = '이미 있는 항목 이름입니다.';

//! 비용 항목 (전사 공통)
// - 조회는 USER 누구나, 관리는 과제 관리 관리자
// - 삭제는 숨기기라 이미 쓴 기록에는 이름이 남고, 같은 이름을 다시 만들 수 있다(부분 unique).
@Injectable()
export class ProjectBudgetCategoriesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_BUDGET_CATEGORY );
    }

    findAll() {
        return this.prisma.projectBudgetCategory.findMany({
            where: { deleted: false },
            select: { id: true, name: true },
            orderBy: { id: 'asc' },
        });
    }

    create( user: ProjectActor, body: SaveBudgetCategoryDto ) {
        const name = body.name.trim();
        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const category = await tx.projectBudgetCategory.create({
                data: { name, createdId: user.id, updatedId: user.id },
                select: { id: true, name: true },
            });
            await this.audit.created( tx, category.id, `비용 항목 추가: ${name}` );
            return category;
        }) );
    }

    update( user: ProjectActor, id: number, body: SaveBudgetCategoryDto ) {
        const name = body.name.trim();
        return this.withDuplicateGuard( () => this.prisma.$transaction( async ( tx ) => {
            const before = await this.findActive( tx, id );
            const category = await tx.projectBudgetCategory.update({
                where: { id },
                data: { name, updatedId: user.id },
                select: { id: true, name: true },
            });
            await this.audit.updated( tx, id, `비용 항목 이름 변경: ${before.name} → ${name}`, { name: { before: before.name, after: name } } );
            return category;
        }) );
    }

    async remove( user: ProjectActor, id: number ) {
        await this.prisma.$transaction( async ( tx ) => {
            const category = await this.findActive( tx, id );
            await tx.projectBudgetCategory.update({ where: { id }, data: { deleted: true, deletedAt: new Date(), deletedId: user.id } });
            await this.audit.deleted( tx, id, `비용 항목 숨김: ${category.name}` );
        });
        return true;
    }

    private async findActive( tx: Prisma.TransactionClient, id: number ) {
        const category = await tx.projectBudgetCategory.findFirst({ where: { id, deleted: false } });
        if ( !category ) throw new NotFoundException( '존재하지 않는 비용 항목입니다.' );
        return category;
    }

    private async withDuplicateGuard<T>( fn: () => Promise<T> ): Promise<T> {
        try {
            return await fn();
        } catch ( e ) {
            if ( e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ) throw new ConflictException( DUPLICATE );
            throw e;
        }
    }
}
