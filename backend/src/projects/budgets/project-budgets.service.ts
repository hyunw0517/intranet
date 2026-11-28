import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditTargetType, FileTargetType, Prisma, ProjectQuoteTaxType } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { FileKind } from "src/common/const/file.const";
import { FilesService } from "src/common/files.service";
import { kstDateString } from "src/common/util/date.util";
import { PrismaService } from "src/prisma/prisma.service";
import { toDateOnly } from "../dto/project.dto";
import { ProjectAccessService, ProjectActor } from "../project-access.service";
import { DEFAULT_VAT_RATE } from "../quotes/quote-rules.util";
import { calcSaleAmounts } from "../sales/sale-rules.util";
import { budgetWarning, fillMonths, monthOf, recentMonths, summarizeCategories } from "./budget-rules.util";
import { CreateProjectExpenseDto, SaveProjectBudgetsDto, UpdateProjectExpenseDto } from "./dto/project-budget.dto";

type Tx = Prisma.TransactionClient;
const ZERO = () => new Prisma.Decimal( 0 );

const categorySelect = { id: true, name: true, deleted: true } satisfies Prisma.ProjectBudgetCategorySelect;

//! 예산·지출 (참여자 누구나, 변경은 감사 로그)
// - 지출은 공급가액 입력 + 부가세 자동. 예산과는 공급가액으로 비교하고, 넘어도 저장한다(경고만).
// - 협력사는 선택이고, 예산 금액을 자동으로 바꾸지 않는다.
// - 숨긴 항목·빠진 협력사는 새로 못 고르지만 이미 쓴 행은 그대로 둔다.
@Injectable()
export class ProjectBudgetsService {

    private readonly budgetAudit: TargetAudit;
    private readonly expenseAudit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly filesService: FilesService,
        auditService: AuditService,
    ){
        this.budgetAudit = auditService.target( AuditTargetType.PROJECT_BUDGET );
        this.expenseAudit = auditService.target( AuditTargetType.PROJECT_EXPENSE );
    }

    //* 예산 탭 전체: 요약 + 항목별 예산 대비 지출 + 협력사별 지급 + 월별 지출 + 지출 목록
    async findAll( user: ProjectActor, projectId: number ) {
        await this.access.check( user, projectId );

        const [ budgets, expenses, partners ] = await Promise.all([
            this.prisma.projectBudget.findMany({ where: { projectId }, include: { category: { select: categorySelect } } }),
            this.prisma.projectExpense.findMany({
                where: { projectId, deleted: false },
                include: {
                    category: { select: categorySelect },
                    partner: { select: { id: true, deleted: true, client: { select: { name: true } } } },
                },
                orderBy: [ { expenseDate: 'desc' }, { id: 'desc' } ],
            }),
            // 활성 협력사 + 빠졌어도 지급 기록이 있는 협력사
            this.prisma.projectPartner.findMany({
                where: { projectId, OR: [ { deleted: false }, { expenses: { some: { deleted: false } } } ] },
                select: { id: true, deleted: true, contractAmount: true, client: { select: { name: true } } },
                orderBy: { id: 'asc' },
            }),
        ]);
        const files = await this.filesService.listByTargets( FileTargetType.PROJECT_EXPENSE, expenses.map( ( e ) => e.id ) );

        const categories = summarizeCategories( budgets, expenses );
        const budgetTotal = categories.reduce( ( sum, c ) => sum.add( c.budgetAmount ), ZERO() );
        const spentTotal = categories.reduce( ( sum, c ) => sum.add( c.spentAmount ), ZERO() );

        return {
            summary: { budgetTotal, spentTotal, remaining: budgetTotal.sub( spentTotal ) },
            categories,
            partners: partners.map( ( p ) => {
                const paid = expenses.filter( ( e ) => e.partnerId === p.id );
                const paidAmount = paid.reduce( ( sum, e ) => sum.add( e.supplyAmount ), ZERO() );
                return {
                    partnerId: p.id,
                    name: p.client.name,
                    removed: p.deleted,
                    contractAmount: p.contractAmount,
                    paidAmount,                                                                       // 공급가액 (계약 금액과 비교하는 기준)
                    paidTotalAmount: paid.reduce( ( sum, e ) => sum.add( e.totalAmount ), ZERO() ),   // 실제 지급액 (부가세 포함)
                    remaining: p.contractAmount ? p.contractAmount.sub( paidAmount ) : null,
                };
            }),
            monthlyExpenses: fillMonths( recentMonths( kstDateString( new Date() ) ), expenses.map( ( e ) => ({ month: monthOf( e.expenseDate ), amount: e.supplyAmount }) ) ),
            expenses: expenses.map( ( e ) => ({ ...e, files: files.get( e.id ) ?? [] }) ),
        };
    }

    //* 항목별 예산 저장 (목록 전체 교체, 빠진 항목의 지출은 그대로 남는다)
    async saveBudgets( user: ProjectActor, projectId: number, body: SaveProjectBudgetsDto ) {
        const access = await this.access.check( user, projectId );
        const ids = body.items.map( ( i ) => i.categoryId );
        if ( new Set( ids ).size !== ids.length ) throw new BadRequestException( '같은 비용 항목이 두 번 들어 있습니다.' );

        await this.prisma.$transaction( async ( tx ) => {
            // 동시에 저장해도 한 번에 하나씩 (FK 참조 INSERT와는 충돌하지 않는 잠금)
            await tx.$queryRaw`SELECT id FROM project_model WHERE id = ${projectId} FOR NO KEY UPDATE`;
            const before = await tx.projectBudget.findMany({ where: { projectId }, include: { category: { select: { id: true, name: true } } } });
            const beforeIds = new Set( before.map( ( b ) => b.categoryId ) );

            // 새로 넣는 항목만 활성 여부 검사 (이미 예산이 있는 숨긴 항목은 금액을 고칠 수 있다)
            const added = ids.filter( ( id ) => !beforeIds.has( id ) );
            const active = await tx.projectBudgetCategory.findMany({ where: { id: { in: added }, deleted: false }, select: { id: true, name: true } });
            if ( active.length !== added.length ) throw new BadRequestException( '고를 수 없는 비용 항목입니다.' );

            await tx.projectBudget.deleteMany({ where: { projectId, categoryId: { notIn: ids } } });
            for ( const item of body.items ) {
                await tx.projectBudget.upsert({
                    where: { projectId_categoryId: { projectId, categoryId: item.categoryId } },
                    create: { projectId, categoryId: item.categoryId, amount: item.amount, createdId: user.id, updatedId: user.id },
                    update: { amount: item.amount, updatedId: user.id },
                });
            }

            // 감사 로그: 항목 이름 → 금액 (바뀐 것이 있을 때만)
            const names = new Map( [ ...before.map( ( b ) => [ b.categoryId, b.category.name ] as const ), ...active.map( ( c ) => [ c.id, c.name ] as const ) ] );
            const beforeMap: Record<string, string> = Object.fromEntries( before.map( ( b ) => [ b.category.name, b.amount.toString() ] ) );
            const afterMap: Record<string, string> = Object.fromEntries( body.items.map( ( i ) => [ names.get( i.categoryId ) ?? String( i.categoryId ), String( i.amount ) ] ) );
            if ( JSON.stringify( this.sorted( beforeMap ) ) !== JSON.stringify( this.sorted( afterMap ) ) ) {
                await this.budgetAudit.updated( tx, projectId, `예산 저장: [${access.projectName}]`, { budgets: { before: beforeMap, after: afterMap } } );
            }
        });
        return true;
    }

    //* 지출 기록 - 예산을 넘어도 저장하고 budgetWarning으로 알린다
    async createExpense( user: ProjectActor, projectId: number, body: CreateProjectExpenseDto ) {
        const access = await this.access.check( user, projectId );
        const taxType = body.taxType ?? ProjectQuoteTaxType.TAXABLE;
        const vatRate = body.vatRate ?? DEFAULT_VAT_RATE;
        const amounts = this.amounts( body.supplyAmount, taxType, vatRate );

        return this.prisma.$transaction( async ( tx ) => {
            await this.assertCategory( tx, body.categoryId );
            if ( body.partnerId ) await this.assertPartner( tx, projectId, body.partnerId );

            const expense = await tx.projectExpense.create({
                data: {
                    projectId,
                    categoryId: body.categoryId,
                    partnerId: body.partnerId ?? null,
                    title: body.title,
                    expenseDate: toDateOnly( body.expenseDate )!,
                    taxType,
                    vatRate,
                    ...amounts,
                    memo: body.memo,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });
            await this.syncFiles( tx, expense.id, user.id, body.attachmentIds ?? [] );
            await this.expenseAudit.created( tx, expense.id, `지출 기록: [${access.projectName}] ${expense.title}`,
                { projectId, categoryId: expense.categoryId, partnerId: expense.partnerId, supplyAmount: amounts.supplyAmount.toString(), totalAmount: amounts.totalAmount.toString() } );
            return { ...expense, budgetWarning: await this.warningFor( tx, projectId, expense.categoryId ) };
        });
    }

    //* 지출 수정 (보낸 항목만)
    async updateExpense( user: ProjectActor, projectId: number, expenseId: number, body: UpdateProjectExpenseDto ) {
        const access = await this.access.check( user, projectId );

        return this.prisma.$transaction( async ( tx ) => {
            const before = await this.lockExpense( tx, projectId, expenseId );

            if ( body.categoryId !== undefined && body.categoryId !== before.categoryId ) await this.assertCategory( tx, body.categoryId );
            if ( body.partnerId && body.partnerId !== before.partnerId ) await this.assertPartner( tx, projectId, body.partnerId );

            const taxType = body.taxType ?? before.taxType;
            const vatRate = body.vatRate ?? before.vatRate;
            const amounts = this.amounts( body.supplyAmount ?? before.supplyAmount, taxType, vatRate );

            const expense = await tx.projectExpense.update({
                where: { id: expenseId },
                data: {
                    categoryId: body.categoryId,
                    partnerId: body.partnerId,
                    title: body.title,
                    expenseDate: toDateOnly( body.expenseDate ) ?? undefined,
                    taxType,
                    vatRate,
                    ...amounts,
                    memo: body.memo,
                    updatedId: user.id,
                },
            });
            if ( body.attachmentIds !== undefined ) await this.syncFiles( tx, expenseId, user.id, body.attachmentIds );

            await this.expenseAudit.updated( tx, expenseId, `지출 수정: [${access.projectName}] ${expense.title}`, {
                supplyAmount: { before: before.supplyAmount.toString(), after: amounts.supplyAmount.toString() },
                categoryId: { before: before.categoryId, after: expense.categoryId },
                partnerId: { before: before.partnerId, after: expense.partnerId },
            }, { projectId, attachmentIds: body.attachmentIds } );
            return { ...expense, budgetWarning: await this.warningFor( tx, projectId, expense.categoryId ) };
        });
    }

    //* 지출 삭제 (soft)
    async deleteExpense( user: ProjectActor, projectId: number, expenseId: number ) {
        const access = await this.access.check( user, projectId );

        await this.prisma.$transaction( async ( tx ) => {
            const expense = await this.lockExpense( tx, projectId, expenseId );
            await tx.projectExpense.update({ where: { id: expenseId }, data: { deleted: true, deletedAt: new Date(), deletedId: user.id } });
            await this.filesService.softDeleteByTarget( tx, [ FileTargetType.PROJECT_EXPENSE ], expenseId, user.id );
            await this.expenseAudit.deleted( tx, expenseId, `지출 삭제: [${access.projectName}] ${expense.title}`, { projectId } );
        });
        return true;
    }

    //* 증빙 파일 다운로드 (프로젝트를 볼 수 있는 사람)
    async openFile( user: ProjectActor, projectId: number, expenseId: number, fileId: number ) {
        await this.access.check( user, projectId );
        const expense = await this.prisma.projectExpense.findFirst({ where: { id: expenseId, projectId, deleted: false }, select: { id: true } });
        if ( !expense ) throw new NotFoundException( '존재하지 않는 지출입니다.' );
        return this.filesService.openTargetFile( fileId, FileTargetType.PROJECT_EXPENSE, expenseId );
    }

    //! 내부

    private amounts( supplyAmount: number | Prisma.Decimal, taxType: ProjectQuoteTaxType, vatRate: number | Prisma.Decimal ) {
        const amounts = calcSaleAmounts( supplyAmount, taxType, vatRate );
        if ( !amounts ) throw new BadRequestException( '금액이 너무 큽니다. (최대 999,999,999,999,999원)' );
        return amounts;
    }

    private async lockExpense( tx: Tx, projectId: number, expenseId: number ) {
        await tx.$queryRaw`SELECT id FROM project_expense_model WHERE id = ${expenseId} FOR UPDATE`;
        const expense = await tx.projectExpense.findFirst({ where: { id: expenseId, projectId, deleted: false } });
        if ( !expense ) throw new NotFoundException( '존재하지 않는 지출입니다.' );
        return expense;
    }

    private async assertCategory( tx: Tx, categoryId: number ) {
        const category = await tx.projectBudgetCategory.findFirst({ where: { id: categoryId, deleted: false }, select: { id: true } });
        if ( !category ) throw new BadRequestException( '고를 수 없는 비용 항목입니다.' );
    }

    private async assertPartner( tx: Tx, projectId: number, partnerId: number ) {
        const partner = await tx.projectPartner.findFirst({ where: { id: partnerId, projectId, deleted: false }, select: { id: true } });
        if ( !partner ) throw new BadRequestException( '이 프로젝트의 협력사가 아닙니다.' );
    }

    // 저장한 뒤 그 항목의 예산 대비 지출 (공급가액 기준)
    private async warningFor( tx: Tx, projectId: number, categoryId: number ) {
        const budget = await tx.projectBudget.findUnique({ where: { projectId_categoryId: { projectId, categoryId } }, select: { amount: true } });
        const spent = await tx.projectExpense.aggregate({ where: { projectId, categoryId, deleted: false }, _sum: { supplyAmount: true } });
        return budgetWarning( budget?.amount ?? ZERO(), spent._sum.supplyAmount ?? ZERO() );
    }

    private syncFiles( tx: Tx, expenseId: number, userId: number, fileIds: number[] ) {
        return this.filesService.syncTargetFiles( tx, { kind: FileKind.ATTACHMENT, targetType: FileTargetType.PROJECT_EXPENSE, targetId: expenseId, fileIds, userId } );
    }

    private sorted( map: Record<string, string> ) {
        return Object.entries( map ).sort( ( [ a ], [ b ] ) => a.localeCompare( b ) );
    }
}
