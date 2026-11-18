import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActionType, AuditTargetType, FileTargetType, Prisma, ProjectQuoteStatus, ProjectQuoteTaxType, ProjectSaleStatus } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { FileKind } from "src/common/const/file.const";
import { FilesService } from "src/common/files.service";
import { PrismaService } from "src/prisma/prisma.service";
import { kstDateString } from "src/common/util/date.util";
import { fillMonths, monthOf, recentMonths } from "../budgets/budget-rules.util";
import { toDateOnly } from "../dto/project.dto";
import { DEFAULT_VAT_RATE } from "../quotes/quote-rules.util";
import { ProjectAccessService, ProjectActor } from "../project-access.service";
import { BillProjectSaleDto, CreateProjectSaleDto, CreateSalePaymentDto, UpdateProjectSaleDto } from "./dto/project-sale.dto";
import { calcSaleAmounts, exceedsQuote, paymentStatus } from "./sale-rules.util";

type Tx = Prisma.TransactionClient;
const ZERO = () => new Prisma.Decimal( 0 );

const AMOUNT_OVER = '금액이 너무 큽니다. (최대 999,999,999,999,999원)';

//! 매출 (docs/design/projects.md 5-2장, 2026-11-17 사용자 결정)
// - 프로젝트에 단다. 확정 견적 연결은 선택 - 연결하면 그 견적 청구 합계(취소 제외, 부가세 포함) ≤ 견적 합계
// - 상태: 청구 예정(PLANNED) → 청구(BILLED, 청구일 = 매출 기준일) / 취소(CANCELLED). 수금 상태는 수금 합계로 계산
// - 참여자 누구나. 청구 예정만 삭제, 청구한 건은 수금이 없을 때만 취소. 금액은 청구 예정일 때만 고친다.
// - 세금계산서: 외부 발행 파일 첨부(Files, PROJECT_SALE) + 승인번호. 첨부·승인번호는 청구 뒤에도 고칠 수 있다(수정본 추가).
// - ⭐ 동시성: 견적 한도 검사는 견적 행을, 수금 한도 검사는 청구 행을 FOR UPDATE로 잠근 뒤 센다.
@Injectable()
export class ProjectSalesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly filesService: FilesService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_SALE );
    }

    //* 목록 + 요약(청구·예정·수금·미수) + 확정 견적별 청구 잔액(청구 건을 만들 때 고르는 목록)
    async findAll( user: ProjectActor, projectId: number ) {
        await this.access.check( user, projectId );

        const sales = await this.prisma.projectSale.findMany({
            where: { projectId, deleted: false },
            include: {
                payments: { where: { deleted: false }, orderBy: [ { paidDate: 'asc' }, { id: 'asc' } ] },
                quoteVersion: { select: { id: true, version: true, quote: { select: { id: true, quoteNo: true, title: true } } } },
            },
            orderBy: [ { id: 'desc' } ],
        });
        const files = await this.filesService.listByTargets( FileTargetType.PROJECT_SALE, sales.map( ( s ) => s.id ) );

        let billedTotal = ZERO(), plannedTotal = ZERO(), paidTotal = ZERO();
        const rows = sales.map( ( s ) => {
            const paidAmount = s.payments.reduce( ( sum, p ) => sum.add( p.amount ), ZERO() );
            if ( s.status === ProjectSaleStatus.BILLED ) { billedTotal = billedTotal.add( s.totalAmount ); paidTotal = paidTotal.add( paidAmount ); }
            if ( s.status === ProjectSaleStatus.PLANNED ) plannedTotal = plannedTotal.add( s.totalAmount );
            return { ...s, paidAmount, paymentStatus: paymentStatus( s.totalAmount, paidAmount ), files: files.get( s.id ) ?? [] };
        });

        return {
            summary: { billedTotal, plannedTotal, paidTotal, outstanding: billedTotal.sub( paidTotal ) },
            // 월별 매출 그래프 (최근 12개월, 청구일 기준, "청구 매출" 카드와 같은 부가세 포함 합계)
            monthlySales: fillMonths( recentMonths( kstDateString( new Date() ) ), sales
                .filter( ( s ) => s.status === ProjectSaleStatus.BILLED && s.billedDate )
                .map( ( s ) => ({ month: monthOf( s.billedDate! ), amount: s.totalAmount }) ) ),
            confirmedQuotes: await this.quoteBalances( projectId ),
            sales: rows,
        };
    }

    //* 만들기 - 청구일이 있으면 바로 "청구"
    async create( user: ProjectActor, projectId: number, body: CreateProjectSaleDto ) {
        const access = await this.access.check( user, projectId );
        const taxType = body.taxType ?? ProjectQuoteTaxType.TAXABLE;
        const vatRate = body.vatRate ?? DEFAULT_VAT_RATE;
        const amounts = this.amounts( body.supplyAmount, taxType, vatRate );
        const status = body.billedDate ? ProjectSaleStatus.BILLED : ProjectSaleStatus.PLANNED;

        return this.prisma.$transaction( async ( tx ) => {
            if ( body.quoteVersionId ) {
                await this.assertQuoteLimit( tx, projectId, body.quoteVersionId, amounts.totalAmount, null );
            }
            const sale = await tx.projectSale.create({
                data: {
                    projectId,
                    quoteVersionId: body.quoteVersionId ?? null,
                    title: body.title,
                    status,
                    taxType,
                    vatRate,
                    ...amounts,
                    plannedDate: toDateOnly( body.plannedDate ),
                    billedDate: toDateOnly( body.billedDate ),
                    taxInvoiceNo: body.taxInvoiceNo,
                    memo: body.memo,
                    createdId: user.id,
                    updatedId: user.id,
                },
            });
            await this.syncFiles( tx, sale.id, user.id, body.attachmentIds ?? [] );
            await this.audit.created( tx, sale.id, `매출 등록: [${access.projectName}] ${sale.title}`,
                { projectId, status, totalAmount: amounts.totalAmount.toString(), quoteVersionId: sale.quoteVersionId } );
            return sale;
        });
    }

    //* 수정 - 청구 예정: 전부 / 청구: 청구명·승인번호·메모·첨부만 / 취소: 불가
    async update( user: ProjectActor, projectId: number, saleId: number, body: UpdateProjectSaleDto ) {
        const access = await this.access.check( user, projectId );

        return this.prisma.$transaction( async ( tx ) => {
            const before = await this.lockSale( tx, projectId, saleId );
            if ( before.status === ProjectSaleStatus.CANCELLED ) throw new BadRequestException( '취소된 청구는 고칠 수 없습니다.' );

            const changesAmount = body.supplyAmount !== undefined || body.taxType !== undefined || body.vatRate !== undefined || body.quoteVersionId !== undefined || body.plannedDate !== undefined;
            if ( before.status === ProjectSaleStatus.BILLED && changesAmount ) {
                throw new BadRequestException( '청구한 건은 금액·견적·과세·부가세율·예정일을 바꿀 수 없습니다. 취소한 뒤 다시 등록해 주세요.' );
            }

            const taxType = body.taxType ?? before.taxType;
            const vatRate = body.vatRate ?? before.vatRate;
            const amounts = this.amounts( body.supplyAmount ?? before.supplyAmount, taxType, vatRate );
            const quoteVersionId = body.quoteVersionId !== undefined ? body.quoteVersionId : before.quoteVersionId;
            if ( quoteVersionId && changesAmount ) {
                await this.assertQuoteLimit( tx, projectId, quoteVersionId, amounts.totalAmount, saleId );
            }

            const data = {
                title: body.title,
                taxInvoiceNo: body.taxInvoiceNo,
                memo: body.memo,
                ...( changesAmount && { taxType, vatRate, quoteVersionId, plannedDate: toDateOnly( body.plannedDate ), ...amounts } ),
            };
            const sale = await tx.projectSale.update({ where: { id: saleId }, data: { ...data, updatedId: user.id } });
            if ( body.attachmentIds !== undefined ) await this.syncFiles( tx, saleId, user.id, body.attachmentIds );

            await this.audit.updated( tx, saleId, `매출 수정: [${access.projectName}] ${sale.title}`, {
                ...( changesAmount && { totalAmount: { before: before.totalAmount.toString(), after: amounts.totalAmount.toString() } } ),
                ...( body.taxInvoiceNo !== undefined && { taxInvoiceNo: { before: before.taxInvoiceNo, after: body.taxInvoiceNo } } ),
            }, { attachmentIds: body.attachmentIds } );
            return sale;
        });
    }

    //* 청구 (청구 예정 → 청구)
    async bill( user: ProjectActor, projectId: number, saleId: number, body: BillProjectSaleDto ) {
        const access = await this.access.check( user, projectId );

        await this.prisma.$transaction( async ( tx ) => {
            const sale = await this.lockSale( tx, projectId, saleId );
            if ( sale.status !== ProjectSaleStatus.PLANNED ) throw new BadRequestException( '청구 예정인 건만 청구할 수 있습니다.' );

            await tx.projectSale.update({
                where: { id: saleId },
                data: {
                    status: ProjectSaleStatus.BILLED,
                    billedDate: toDateOnly( body.billedDate ),
                    ...( body.taxInvoiceNo !== undefined && { taxInvoiceNo: body.taxInvoiceNo } ),
                    updatedId: user.id,
                },
            });
            if ( body.attachmentIds !== undefined ) await this.syncFiles( tx, saleId, user.id, body.attachmentIds );
            await this.statusAudit( tx, saleId, `매출 청구: [${access.projectName}] ${sale.title}`, 'PLANNED', 'BILLED', { billedDate: body.billedDate } );
        });
        return true;
    }

    //* 청구 취소 - 수금 기록이 없을 때만, "취소됨"으로 남김
    async cancel( user: ProjectActor, projectId: number, saleId: number ) {
        const access = await this.access.check( user, projectId );

        await this.prisma.$transaction( async ( tx ) => {
            const sale = await this.lockSale( tx, projectId, saleId );
            if ( sale.status !== ProjectSaleStatus.BILLED ) throw new BadRequestException( '청구한 건만 취소할 수 있습니다. 청구 예정은 삭제해 주세요.' );
            const paid = await tx.projectSalePayment.count({ where: { saleId, deleted: false } });
            if ( paid > 0 ) throw new BadRequestException( '수금 기록이 있는 청구는 취소할 수 없습니다. 수금 기록을 먼저 지워 주세요.' );

            await tx.projectSale.update({
                where: { id: saleId },
                data: { status: ProjectSaleStatus.CANCELLED, cancelledAt: new Date(), cancelledId: user.id, updatedId: user.id },
            });
            await this.statusAudit( tx, saleId, `매출 청구 취소: [${access.projectName}] ${sale.title}`, 'BILLED', 'CANCELLED' );
        });
        return true;
    }

    //* 삭제 - 청구 예정만 (soft)
    async delete( user: ProjectActor, projectId: number, saleId: number ) {
        const access = await this.access.check( user, projectId );

        await this.prisma.$transaction( async ( tx ) => {
            const sale = await this.lockSale( tx, projectId, saleId );
            if ( sale.status !== ProjectSaleStatus.PLANNED ) throw new BadRequestException( '청구 예정인 건만 삭제할 수 있습니다. 청구한 건은 취소해 주세요.' );

            await tx.projectSale.update({ where: { id: saleId }, data: { deleted: true, deletedAt: new Date(), deletedId: user.id } });
            await this.filesService.softDeleteByTarget( tx, [ FileTargetType.PROJECT_SALE ], saleId, user.id );
            await this.audit.deleted( tx, saleId, `매출 삭제(청구 예정): [${access.projectName}] ${sale.title}` );
        });
        return true;
    }

    //* 수금 기록 - 청구한 건에만, 수금 합계 ≤ 청구 금액 (청구 행 잠금 후 검사)
    async addPayment( user: ProjectActor, projectId: number, saleId: number, body: CreateSalePaymentDto ) {
        const access = await this.access.check( user, projectId );

        return this.prisma.$transaction( async ( tx ) => {
            const sale = await this.lockSale( tx, projectId, saleId );
            if ( sale.status !== ProjectSaleStatus.BILLED ) throw new BadRequestException( '청구한 건에만 수금을 기록할 수 있습니다.' );

            const paid = await tx.projectSalePayment.aggregate({ where: { saleId, deleted: false }, _sum: { amount: true } });
            const after = ( paid._sum.amount ?? ZERO() ).add( body.amount );
            if ( after.gt( sale.totalAmount ) ) {
                throw new BadRequestException( `수금 합계가 청구 금액을 넘습니다. (남은 금액 ${sale.totalAmount.sub( paid._sum.amount ?? ZERO() ).toString()}원)` );
            }

            const payment = await tx.projectSalePayment.create({
                data: { saleId, paidDate: toDateOnly( body.paidDate )!, amount: body.amount, memo: body.memo, createdId: user.id },
            });
            await this.audit.log( { targetId: saleId, actionType: AuditActionType.CREATE,
                content: `수금 기록: [${access.projectName}] ${sale.title} ${body.amount}원`, detail: { paymentId: payment.id, paidDate: body.paidDate, amount: body.amount } }, tx );
            return payment;
        });
    }

    //* 수금 기록 삭제 (soft)
    async deletePayment( user: ProjectActor, projectId: number, saleId: number, paymentId: number ) {
        const access = await this.access.check( user, projectId );

        await this.prisma.$transaction( async ( tx ) => {
            const sale = await this.lockSale( tx, projectId, saleId );
            const { count } = await tx.projectSalePayment.updateMany({
                where: { id: paymentId, saleId, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id },
            });
            if ( count === 0 ) throw new NotFoundException( '존재하지 않는 수금 기록입니다.' );
            await this.audit.log( { targetId: saleId, actionType: AuditActionType.DELETE,
                content: `수금 기록 삭제: [${access.projectName}] ${sale.title}`, detail: { paymentId } }, tx );
        });
        return true;
    }

    //* 세금계산서 파일 다운로드 (프로젝트를 볼 수 있는 사람)
    async openFile( user: ProjectActor, projectId: number, saleId: number, fileId: number ) {
        await this.access.check( user, projectId );
        const sale = await this.prisma.projectSale.findFirst({ where: { id: saleId, projectId, deleted: false }, select: { id: true } });
        if ( !sale ) throw new NotFoundException( '존재하지 않는 매출입니다.' );
        return this.filesService.openTargetFile( fileId, FileTargetType.PROJECT_SALE, saleId );
    }

    //* 견적 확정 취소 전 검사 (견적 서비스가 견적 행을 잠근 트랜잭션 안에서 부른다)
    // 취소되지 않은 청구(예정 포함)가 연결돼 있으면 확정을 취소할 수 없다 (5-1장 남은 규칙)
    static async countLinkedSales( tx: Tx, quoteVersionId: number ) {
        return tx.projectSale.count({ where: { quoteVersionId, deleted: false, status: { not: ProjectSaleStatus.CANCELLED } } });
    }

    //! 내부

    private amounts( supplyAmount: number | Prisma.Decimal, taxType: ProjectQuoteTaxType, vatRate: number | Prisma.Decimal ) {
        const amounts = calcSaleAmounts( supplyAmount, taxType, vatRate );
        if ( !amounts ) throw new BadRequestException( AMOUNT_OVER );
        return amounts;
    }

    private async lockSale( tx: Tx, projectId: number, saleId: number ) {
        await tx.$queryRaw`SELECT id FROM project_sale_model WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.projectSale.findFirst({ where: { id: saleId, projectId, deleted: false } });
        if ( !sale ) throw new NotFoundException( '존재하지 않는 매출입니다.' );
        return sale;
    }

    // ⭐ 분할 청구 한도: 견적 행을 잠근 뒤(견적 확정 취소와도 직렬화) 그 버전이 이 프로젝트의 확정 견적인지, 합계가 넘지 않는지
    private async assertQuoteLimit( tx: Tx, projectId: number, quoteVersionId: number, thisTotal: Prisma.Decimal, exceptSaleId: number | null ) {
        const version = await tx.projectQuoteVersion.findFirst({
            where: { id: quoteVersionId, quote: { projectId, deleted: false } },
            select: { id: true, quoteId: true, status: true, totalAmount: true },
        });
        if ( !version ) throw new BadRequestException( '이 프로젝트의 견적이 아닙니다.' );
        await tx.$queryRaw`SELECT id FROM project_quote_model WHERE id = ${version.quoteId} FOR UPDATE`;

        const fresh = await tx.projectQuoteVersion.findUniqueOrThrow({ where: { id: quoteVersionId }, select: { status: true, totalAmount: true } });
        if ( fresh.status !== ProjectQuoteStatus.CONFIRMED ) throw new BadRequestException( '확정된 견적에만 매출을 연결할 수 있습니다.' );

        const others = await tx.projectSale.aggregate({
            where: { quoteVersionId, deleted: false, status: { not: ProjectSaleStatus.CANCELLED }, ...( exceptSaleId && { id: { not: exceptSaleId } } ) },
            _sum: { totalAmount: true },
        });
        const otherTotal = others._sum.totalAmount ?? ZERO();
        if ( exceedsQuote( fresh.totalAmount, otherTotal, thisTotal ) ) {
            throw new BadRequestException( `견적 금액을 넘습니다. (견적 합계 ${fresh.totalAmount.toString()}원, 이미 청구 ${otherTotal.toString()}원)` );
        }
    }

    // 확정 견적별 청구 잔액 (청구 건을 만들 때 고르는 목록)
    private async quoteBalances( projectId: number ) {
        const versions = await this.prisma.projectQuoteVersion.findMany({
            where: { status: ProjectQuoteStatus.CONFIRMED, quote: { projectId, deleted: false } },
            select: {
                id: true, version: true, taxType: true, vatRate: true, totalAmount: true,
                quote: { select: { id: true, quoteNo: true, title: true } },
                sales: { where: { deleted: false, status: { not: ProjectSaleStatus.CANCELLED } }, select: { totalAmount: true } },
            },
            orderBy: { id: 'asc' },
        });
        return versions.map( ( { sales, ...v } ) => {
            const billed = sales.reduce( ( sum, s ) => sum.add( s.totalAmount ), ZERO() );
            return { ...v, billedAmount: billed, remaining: v.totalAmount.sub( billed ) };
        });
    }

    private syncFiles( tx: Tx, saleId: number, userId: number, fileIds: number[] ) {
        return this.filesService.syncTargetFiles( tx, { kind: FileKind.ATTACHMENT, targetType: FileTargetType.PROJECT_SALE, targetId: saleId, fileIds, userId } );
    }

    private statusAudit( tx: Tx, saleId: number, content: string, before: string, after: string, extra?: Record<string, unknown> ) {
        return this.audit.log( { targetId: saleId, actionType: AuditActionType.STATUS_CHANGE, content, detail: { ...extra, changes: { status: { before, after } } } }, tx );
    }
}
