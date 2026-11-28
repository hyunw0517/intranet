import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, AuditActionType, AuditTargetType, Prisma, ProjectQuoteStatus, ProjectQuoteTaxType } from "src/generated/prisma/client";
import { AddonsService } from "src/common/addons.service";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { kstDateString } from "src/common/util/date.util";
import { PrismaService } from "src/prisma/prisma.service";
import { toDateOnly } from "../dto/project.dto";
import { ProjectAccessService, ProjectActor } from "../project-access.service";
import { ProjectSalesService } from "../sales/project-sales.service";
import { CreateProjectQuoteDto, QuoteContentDto, UpdateProjectQuoteDto } from "./dto/project-quote.dto";
import { buildQuoteHtml, calcQuote, DEFAULT_VAT_RATE, formatQuoteNo, isQuoteEditable, QuoteDisplayStatus, quoteDisplayStatus } from "./quote-rules.util";

type Tx = Prisma.TransactionClient;

const AMOUNT_OVER = '금액이 너무 큽니다. (최대 999,999,999,999,999원)';
const NOT_EDITABLE = '작성 중이거나 반려된 최신 버전만 고칠 수 있습니다.';

const versionInclude = { items: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.ProjectQuoteVersionInclude;
type VersionRow = Prisma.ProjectQuoteVersionGetPayload<{ include: typeof versionInclude }>;

//! 견적서 (참여자 누구나)
// - 같은 견적번호 아래 v1, v2… 최신 버전만 고치고 확정한다. 확정된 견적은 새 버전 불가.
// - 저장 상태는 DRAFT·CONFIRMED·CANCELLED이고, "결재 중·반려"는 연결된 결재 문서로 계산한다.
// - 결재가 켜져 있으면 확정은 결재로만, 꺼져 있으면 직접 확정.
// - 발주처·수신 담당자는 작성 중 버전을 저장할 때마다 스냅샷을 찍는다.
// - 상태를 바꾸는 작업은 견적 행을 FOR UPDATE로 잠근 뒤 다시 읽는다. 견적번호는 연도별 채번 행을 잠근다.
@Injectable()
export class ProjectQuotesService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly access: ProjectAccessService,
        private readonly addons: AddonsService,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.PROJECT_QUOTE );
    }

    //* 결재가 켜져 있는지 (켜져 있으면 확정은 결재로만, 화면은 [결재 요청] 버튼)
    approvalEnabled(){
        return this.addons.isEnabled( 'approvals' );
    }

    //* 목록 - 견적마다 최신 버전 요약 + 프로젝트 계약 금액(확정 버전 합계)
    async findAll( user: ProjectActor, projectId: number ) {
        await this.access.check( user, projectId );

        const quotes = await this.prisma.projectQuote.findMany({
            where: { projectId, deleted: false },
            include: { versions: { orderBy: { version: 'desc' } } },
            orderBy: { id: 'desc' },
        });
        const approvals = await this.approvalStatuses( quotes.flatMap( ( q ) => q.versions ) );

        let contractAmount = new Prisma.Decimal( 0 );
        const rows = quotes.map( ( q ) => {
            const latest = q.versions[0];
            const confirmed = q.versions.filter( ( v ) => v.status === ProjectQuoteStatus.CONFIRMED );
            for ( const v of confirmed ) contractAmount = contractAmount.add( v.totalAmount );
            return {
                id: q.id,
                quoteNo: q.quoteNo,
                title: q.title,
                versionCount: q.versions.length,
                latest: {
                    id: latest.id,
                    version: latest.version,
                    status: this.display( latest, approvals ),
                    taxType: latest.taxType,
                    vatRate: latest.vatRate,
                    quoteDate: latest.quoteDate,
                    totalAmount: latest.totalAmount,
                },
                createdAt: q.createdAt,
            };
        });

        return { approvalEnabled: this.approvalEnabled(), contractAmount, quotes: rows };
    }

    //* 상세 - 모든 버전(최신 순, 품목 포함) + 버전별 표시 상태·결재 문서
    async findOne( user: ProjectActor, projectId: number, quoteId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );
        const versions = await this.prisma.projectQuoteVersion.findMany({
            where: { quoteId },
            include: versionInclude,
            orderBy: { version: 'desc' },
        });
        const approvals = await this.approvalStatuses( versions );

        return {
            id: quote.id,
            quoteNo: quote.quoteNo,
            title: quote.title,
            projectId,
            projectName: access.projectName,
            approvalEnabled: this.approvalEnabled(),
            versions: versions.map( ( v, i ) => ({
                ...v,
                isLatest: i === 0,
                displayStatus: this.display( v, approvals ),
                approvalDocument: v.approvalDocumentId ? { id: v.approvalDocumentId, status: approvals.get( v.approvalDocumentId ) ?? null } : null,
            }) ),
            createdAt: quote.createdAt,
        };
    }

    //* 만들기 - 견적번호 채번 + v1(작성 중). 프로젝트에 발주처가 있어야 한다.
    async create( user: ProjectActor, projectId: number, body: CreateProjectQuoteDto ) {
        const access = await this.access.check( user, projectId );
        const snapshot = await this.snapshot( projectId, body.contactId ?? null );
        const content = this.content( body );
        const year = Number( ( body.quoteDate ?? kstDateString( new Date() ) ).slice( 0, 4 ) );

        return this.prisma.$transaction( async ( tx ) => {
            const quoteNo = await this.nextQuoteNo( tx, year );
            const quote = await tx.projectQuote.create({
                data: { projectId, quoteNo, title: body.title, createdId: user.id, updatedId: user.id },
            });
            await tx.projectQuoteVersion.create({
                data: { quoteId: quote.id, version: 1, ...content.version, ...snapshot, createdId: user.id, updatedId: user.id, items: { create: content.items } },
            });
            await this.audit.created( tx, quote.id, `견적 작성: [${access.projectName}] ${quoteNo} ${quote.title}`,
                { projectId, version: 1, totalAmount: content.version.totalAmount.toString() } );
            return quote;
        });
    }

    //* 작성 중(또는 반려된) 최신 버전 저장 - 품목은 보내면 전체 교체, 발주처·담당자 스냅샷을 다시 찍는다
    async updateVersion( user: ProjectActor, projectId: number, quoteId: number, versionId: number, body: UpdateProjectQuoteDto ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        return this.prisma.$transaction( async ( tx ) => {
            const version = await this.lockEditableLatest( tx, quoteId, versionId );
            const merged = this.mergeContent( version, body );
            const snapshot = await this.snapshot( projectId, body.contactId !== undefined ? body.contactId : version.contactId, tx );

            await tx.projectQuoteItem.deleteMany({ where: { versionId } });
            await tx.projectQuoteVersion.update({
                where: { id: versionId },
                data: { ...merged.version, ...snapshot, updatedId: user.id, items: { create: merged.items } },
            });
            if ( body.title !== undefined && body.title !== quote.title ) {
                await tx.projectQuote.update({ where: { id: quoteId }, data: { title: body.title, updatedId: user.id } });
            }
            await this.audit.updated( tx, quoteId, `견적 수정: [${access.projectName}] ${quote.quoteNo} v${version.version}`,
                { totalAmount: { before: version.totalAmount.toString(), after: merged.version.totalAmount.toString() } }, { versionId } );
            return true;
        });
    }

    //* 새 버전 - 최신 버전을 복사해 작성 중으로. 최신이 확정이거나 결재 중이면 불가
    async createVersion( user: ProjectActor, projectId: number, quoteId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        return this.prisma.$transaction( async ( tx ) => {
            await this.lockQuote( tx, quoteId );
            const latest = await this.latestVersion( tx, quoteId );
            const display = this.display( latest, await this.approvalStatuses( [ latest ], tx ) );
            if ( display === 'CONFIRMED' ) throw new BadRequestException( '확정된 견적은 새 버전을 만들 수 없습니다. 변경은 새 견적으로 냅니다.' );
            if ( display === 'IN_APPROVAL' ) throw new BadRequestException( '결재 중인 견적은 새 버전을 만들 수 없습니다.' );

            const snapshot = await this.snapshot( projectId, latest.contactId, tx );
            const created = await tx.projectQuoteVersion.create({
                data: {
                    quoteId,
                    version: latest.version + 1,
                    taxType: latest.taxType,
                    vatRate: latest.vatRate,
                    quoteDate: toDateOnly( kstDateString( new Date() ) )!,
                    validUntil: null,
                    note: latest.note,
                    supplyAmount: latest.supplyAmount,
                    vatAmount: latest.vatAmount,
                    totalAmount: latest.totalAmount,
                    ...snapshot,
                    createdId: user.id,
                    updatedId: user.id,
                    items: { create: latest.items.map( ( i ) => ({ sortOrder: i.sortOrder, name: i.name, spec: i.spec, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount, note: i.note }) ) },
                },
            });
            await this.audit.log( { targetId: quoteId, actionType: AuditActionType.CREATE,
                content: `견적 새 버전: [${access.projectName}] ${quote.quoteNo} v${created.version}`, detail: { versionId: created.id, from: latest.version } }, tx );
            return created;
        });
    }

    //* 최신 작성 중 버전 삭제 (v1은 견적 삭제로)
    async deleteVersion( user: ProjectActor, projectId: number, quoteId: number, versionId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        await this.prisma.$transaction( async ( tx ) => {
            const version = await this.lockEditableLatest( tx, quoteId, versionId );
            if ( version.version === 1 ) throw new BadRequestException( '첫 버전은 지울 수 없습니다. 견적을 삭제해 주세요.' );
            await tx.projectQuoteVersion.delete({ where: { id: versionId } });
            await this.audit.deleted( tx, quoteId, `견적 버전 삭제: [${access.projectName}] ${quote.quoteNo} v${version.version}`, { versionId } );
        });
        return true;
    }

    //* 견적 삭제 (soft) - 확정된 버전이 없고 결재 중이 아닐 때만
    async delete( user: ProjectActor, projectId: number, quoteId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        await this.prisma.$transaction( async ( tx ) => {
            await this.lockQuote( tx, quoteId );
            const versions = await tx.projectQuoteVersion.findMany({ where: { quoteId } });
            const approvals = await this.approvalStatuses( versions, tx );
            const statuses = versions.map( ( v ) => this.display( v, approvals ) );
            if ( statuses.includes( 'CONFIRMED' ) ) throw new BadRequestException( '확정된 버전이 있는 견적은 삭제할 수 없습니다. 확정을 취소한 뒤 삭제해 주세요.' );
            if ( statuses.includes( 'IN_APPROVAL' ) ) throw new BadRequestException( '결재 중인 견적은 삭제할 수 없습니다.' );

            await tx.projectQuote.update({ where: { id: quoteId }, data: { deleted: true, deletedAt: new Date(), deletedId: user.id } });
            await this.audit.deleted( tx, quoteId, `견적 삭제: [${access.projectName}] ${quote.quoteNo} ${quote.title}` );
        });
        return true;
    }

    //* 직접 확정 (결재가 꺼진 배포에서만) - 최신 작성 중 버전, 품목 1개 이상
    async confirm( user: ProjectActor, projectId: number, quoteId: number, versionId: number ) {
        if ( this.approvalEnabled() ) {
            throw new BadRequestException( '전자결재가 켜져 있어 견적은 결재로 확정합니다. [결재 요청]을 이용해 주세요.' );
        }
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        await this.prisma.$transaction( async ( tx ) => {
            const version = await this.lockEditableLatest( tx, quoteId, versionId );
            this.assertHasItems( version );
            await tx.projectQuoteVersion.update({
                where: { id: versionId },
                data: { status: ProjectQuoteStatus.CONFIRMED, confirmedAt: new Date(), confirmedId: user.id, updatedId: user.id },
            });
            await this.statusAudit( tx, quoteId, `견적 확정: [${access.projectName}] ${quote.quoteNo} v${version.version}`, versionId, 'DRAFT', 'CONFIRMED' );
        });
        return true;
    }

    //* 확정 취소 - "취소됨"으로 남긴다(작성 중으로 돌아가지 않음). 결재로 확정된 것도 가능.
    // 연결된 매출이 있으면 취소 불가. 견적 행을 잠근 뒤 세서 매출 등록과 직렬화된다
    async cancelConfirm( user: ProjectActor, projectId: number, quoteId: number, versionId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );

        await this.prisma.$transaction( async ( tx ) => {
            await this.lockQuote( tx, quoteId );
            if ( await ProjectSalesService.countLinkedSales( tx, versionId ) > 0 ) {
                throw new BadRequestException( '매출이 연결된 견적은 확정을 취소할 수 없습니다. 연결된 청구를 먼저 삭제·취소해 주세요.' );
            }
            const { count } = await tx.projectQuoteVersion.updateMany({
                where: { id: versionId, quoteId, status: ProjectQuoteStatus.CONFIRMED },
                data: { status: ProjectQuoteStatus.CANCELLED, cancelledAt: new Date(), cancelledId: user.id, updatedId: user.id },
            });
            if ( count === 0 ) throw new BadRequestException( '확정된 버전만 확정을 취소할 수 있습니다.' );
            await this.statusAudit( tx, quoteId, `견적 확정 취소: [${access.projectName}] ${quote.quoteNo}`, versionId, 'CONFIRMED', 'CANCELLED' );
        });
        return true;
    }

    //! 결재 연동 (ProjectsApprovalModule이 쓴다)

    //* 상신 준비: 최신 작성 중 버전을 잠그고 결재 문서 제목·본문(견적 스냅샷 HTML)을 만든다
    async prepareSubmission( tx: Tx, user: ProjectActor, projectId: number, quoteId: number, versionId: number ) {
        const access = await this.access.check( user, projectId );
        const quote = await this.findQuote( projectId, quoteId );
        const version = await this.lockEditableLatest( tx, quoteId, versionId );
        this.assertHasItems( version );

        const title = `견적서 ${quote.quoteNo} v${version.version} - ${quote.title}`.slice( 0, 200 );
        const content = buildQuoteHtml({
            quoteNo: quote.quoteNo,
            version: version.version,
            title: quote.title,
            projectName: access.projectName,
            taxType: version.taxType,
            vatRate: version.vatRate,
            quoteDate: version.quoteDate.toISOString().slice( 0, 10 ),
            validUntil: version.validUntil?.toISOString().slice( 0, 10 ) ?? null,
            clientName: version.clientName,
            clientBusinessNo: version.clientBusinessNo,
            contactName: version.contactName,
            items: version.items,
            supplyAmount: version.supplyAmount,
            vatAmount: version.vatAmount,
            totalAmount: version.totalAmount,
            note: version.note,
        });
        return { title, content, version, quote, projectName: access.projectName };
    }

    //* 결재 문서 연결 (결재 문서를 만드는 트랜잭션 안)
    // 이전 연결과 버전 수정 시각이 준비할 때 그대로일 때만 바꾼다
    // (동시에 두 번 상신하거나, 준비 후 견적이 바뀌어 본문 스냅샷과 달라지는 것을 막는다)
    async linkApprovalDocument( tx: Tx, versionId: number, previousDocumentId: number | null, preparedUpdatedAt: Date, documentId: number ) {
        const { count } = await tx.projectQuoteVersion.updateMany({
            where: { id: versionId, status: ProjectQuoteStatus.DRAFT, approvalDocumentId: previousDocumentId, updatedAt: preparedUpdatedAt },
            data: { approvalDocumentId: documentId },
        });
        if ( count === 0 ) throw new ConflictException( '다른 사람이 먼저 결재를 올렸거나 견적이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.' );
    }

    //* 결재 상신 검사 (결재 처리기 onSubmit) - 연결된 버전이 아직 작성 중이고 품목이 있는지
    async assertSubmittable( tx: Tx, documentId: number ) {
        const version = await tx.projectQuoteVersion.findUnique({ where: { approvalDocumentId: documentId }, include: versionInclude });
        if ( !version || version.status !== ProjectQuoteStatus.DRAFT ) {
            throw new BadRequestException( '견적서가 작성 중 상태가 아닙니다.' );
        }
        this.assertHasItems( version );
    }

    //* 최종 승인 → 확정 (결재 처리기 onFinalApproved, 결재와 같은 트랜잭션)
    async confirmByApproval( tx: Tx, documentId: number, requesterId: number ) {
        const version = await tx.projectQuoteVersion.findUnique({ where: { approvalDocumentId: documentId }, include: { quote: true } });
        if ( !version ) throw new BadRequestException( '결재 문서와 연결된 견적서가 없습니다.' );
        await this.lockQuote( tx, version.quoteId );

        const { count } = await tx.projectQuoteVersion.updateMany({
            where: { id: version.id, status: ProjectQuoteStatus.DRAFT },
            data: { status: ProjectQuoteStatus.CONFIRMED, confirmedAt: new Date(), confirmedId: requesterId },
        });
        if ( count === 0 ) throw new ConflictException( '견적서가 작성 중 상태가 아니라 확정할 수 없습니다.' );
        await this.statusAudit( tx, version.quoteId, `견적 확정(결재 승인): ${version.quote.quoteNo} v${version.version}`, version.id, 'IN_APPROVAL', 'CONFIRMED', { approvalDocumentId: documentId } );
    }

    //! 내부

    private async findQuote( projectId: number, quoteId: number ) {
        const quote = await this.prisma.projectQuote.findFirst({ where: { id: quoteId, projectId, deleted: false } });
        if ( !quote ) throw new NotFoundException( '존재하지 않는 견적서입니다.' );
        return quote;
    }

    private async lockQuote( tx: Tx, quoteId: number ) {
        await tx.$queryRaw`SELECT id FROM project_quote_model WHERE id = ${quoteId} FOR UPDATE`;
    }

    private async latestVersion( tx: Tx, quoteId: number ): Promise<VersionRow> {
        const latest = await tx.projectQuoteVersion.findFirst({ where: { quoteId }, include: versionInclude, orderBy: { version: 'desc' } });
        if ( !latest ) throw new NotFoundException( '견적서 버전이 없습니다.' );
        return latest;
    }

    // 견적을 잠근 뒤: 그 버전이 최신이고 고칠 수 있는 상태(작성 중·반려)인지
    private async lockEditableLatest( tx: Tx, quoteId: number, versionId: number ): Promise<VersionRow> {
        await this.lockQuote( tx, quoteId );
        const latest = await this.latestVersion( tx, quoteId );
        if ( latest.id !== versionId ) throw new BadRequestException( NOT_EDITABLE );
        const display = this.display( latest, await this.approvalStatuses( [ latest ], tx ) );
        if ( !isQuoteEditable( display ) ) throw new BadRequestException( NOT_EDITABLE );
        return latest;
    }

    private assertHasItems( version: { items: unknown[] } ) {
        if ( version.items.length === 0 ) throw new BadRequestException( '품목을 1개 이상 입력해 주세요.' );
    }

    // 결재 문서 상태 (결재 모듈은 import하지 않고 테이블만 읽는다)
    private async approvalStatuses( versions: { approvalDocumentId: number | null }[], db: Tx | PrismaService = this.prisma ) {
        const ids = versions.map( ( v ) => v.approvalDocumentId ).filter( ( id ): id is number => id !== null );
        if ( ids.length === 0 ) return new Map<number, ApprovalStatus>();
        const docs = await db.approvalDocument.findMany({ where: { id: { in: ids }, deleted: false }, select: { id: true, status: true } });
        return new Map( docs.map( ( d ) => [ d.id, d.status ] ) );
    }

    private display( v: { status: ProjectQuoteStatus; approvalDocumentId: number | null }, approvals: Map<number, ApprovalStatus> ): QuoteDisplayStatus {
        return quoteDisplayStatus( v.status, v.approvalDocumentId ? approvals.get( v.approvalDocumentId ) : null );
    }

    // 연도별 일련번호 - 그 해의 채번 행을 만든 뒤(없으면) 잠그고 1 올린다
    private async nextQuoteNo( tx: Tx, year: number ) {
        await tx.$executeRaw`INSERT INTO project_quote_sequence_model (year, last_no) VALUES (${year}, 0) ON CONFLICT (year) DO NOTHING`;
        const [ row ] = await tx.$queryRaw<{ last_no: number }[]>`SELECT last_no FROM project_quote_sequence_model WHERE year = ${year} FOR UPDATE`;
        const next = row.last_no + 1;
        await tx.projectQuoteSequence.update({ where: { year }, data: { lastNo: next } });
        return formatQuoteNo( year, next );
    }

    // 발주처(프로젝트의 거래처) + 수신 담당자 스냅샷
    private async snapshot( projectId: number, contactId: number | null, db: Tx | PrismaService = this.prisma ) {
        const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { client: true } });
        if ( !project.client ) {
            throw new BadRequestException( '견적서를 쓰려면 프로젝트에 발주처(거래처)를 먼저 지정해 주세요.' );
        }
        const c = project.client;
        let contact: { id: number; name: string; department: string | null; jobTitle: string | null; hp: string | null; email: string | null } | null = null;
        if ( contactId ) {
            contact = await db.projectClientContact.findFirst({ where: { id: contactId, clientId: c.id, deleted: false } });
            if ( !contact ) throw new BadRequestException( '발주처의 담당자만 수신자로 지정할 수 있습니다.' );
        }
        return {
            clientId: c.id, clientName: c.name, clientBusinessNo: c.businessNo, clientCeoName: c.ceoName, clientAddress: c.address, clientTel: c.tel,
            contactId: contact?.id ?? null, contactName: contact?.name ?? null, contactDepartment: contact?.department ?? null,
            contactJobTitle: contact?.jobTitle ?? null, contactHp: contact?.hp ?? null, contactEmail: contact?.email ?? null,
        };
    }

    // 요청 → 저장할 버전 값 + 품목 (금액 계산 포함)
    private content( body: QuoteContentDto ) {
        const taxType = body.taxType ?? ProjectQuoteTaxType.TAXABLE;
        const vatRate = body.vatRate ?? DEFAULT_VAT_RATE;
        const quoteDate = body.quoteDate ?? kstDateString( new Date() );
        this.assertValidUntil( quoteDate, body.validUntil ?? null );
        const calc = calcQuote( body.items ?? [], taxType, vatRate );
        if ( !calc ) throw new BadRequestException( AMOUNT_OVER );
        return {
            version: {
                taxType,
                vatRate,
                quoteDate: toDateOnly( quoteDate )!,
                validUntil: toDateOnly( body.validUntil ?? null ),
                note: body.note ?? null,
                supplyAmount: calc.supplyAmount,
                vatAmount: calc.vatAmount,
                totalAmount: calc.totalAmount,
            },
            items: calc.rows.map( ( r ) => ({ sortOrder: r.sortOrder, name: r.name, spec: r.spec ?? null, quantity: r.quantity, unitPrice: r.unitPrice, amount: r.amount, note: r.note ?? null }) ),
        };
    }

    // 보낸 항목만 바꾸고 나머지는 저장된 값 (품목을 안 보내면 기존 품목으로 다시 계산)
    private mergeContent( version: VersionRow, body: QuoteContentDto ) {
        return this.content({
            taxType: body.taxType ?? version.taxType,
            vatRate: body.vatRate ?? version.vatRate.toNumber(),
            quoteDate: body.quoteDate ?? version.quoteDate.toISOString().slice( 0, 10 ),
            validUntil: body.validUntil !== undefined ? body.validUntil : version.validUntil?.toISOString().slice( 0, 10 ) ?? null,
            note: body.note !== undefined ? body.note : version.note,
            items: body.items ?? version.items.map( ( i ) => ({ name: i.name, spec: i.spec, quantity: i.quantity, unitPrice: Number( i.unitPrice ), note: i.note }) ),
        });
    }

    private assertValidUntil( quoteDate: string, validUntil: string | null ) {
        if ( validUntil && validUntil < quoteDate ) throw new BadRequestException( '유효기간은 견적일 이후여야 합니다.' );
    }

    private statusAudit( tx: Tx, quoteId: number, content: string, versionId: number, before: string, after: string, extra?: Record<string, unknown> ) {
        return this.audit.log( { targetId: quoteId, actionType: AuditActionType.STATUS_CHANGE, content,
            detail: { ...extra, versionId, changes: { status: { before, after } } } }, tx );
    }
}
