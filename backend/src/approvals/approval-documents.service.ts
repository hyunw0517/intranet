import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ApprovalStatus, ApprovalStepStatus, AuditActionType, AuditTargetType, FileTargetType, Prisma, UserRole, Users } from "src/generated/prisma/client";
import { AuditService, TargetAudit } from "src/common/audit.service";
import { FileKind } from "src/common/const/file.const";
import { FilesService } from "src/common/files.service";
import { diffChanges } from "src/common/util/audit-detail.util";
import { PaginatePage } from "src/common/util/pagination.util";
import { sanitizeEditorHtml } from "src/common/util/sanitize-html.util";
import { PrismaService } from "src/prisma/prisma.service";
import { ApprovalHandlerRegistry, DraftDataWriter, HandledDocument } from "./approval-handler.registry";
import { ApprovalLinesService } from "./approval-lines.service";
import { ApprovalNotifier, NotifiedDocument } from "./approval-notifier";
import { ApproverInfo, ApproversService } from "./approvers.service";
import { ApprovalBox, STATE_CHANGED_MESSAGE } from "./const/approval.const";
import {
    ApprovalDocumentListQueryDto, ApproveDocumentDto, CreateApprovalDocumentDto, RejectDocumentDto, ReplaceApproverDto, UpdateApprovalDocumentDto,
} from "./dto/approval-document.dto";
import { checkApproverIds, checkStepGroups, groupSteps, IN_PROGRESS_STATUSES, nextAfterApprove } from "./util/approval-rules.util";

type Actor = Pick<Users, 'id' | 'role'>;
type Tx = Prisma.TransactionClient;

// 단계 정렬: 단계 번호 → 같은 단계 안은 입력 순서(id)
const STEP_ORDER_BY: Prisma.ApprovalDocumentStepOrderByWithRelationInput[] = [ { stepOrder: 'asc' }, { id: 'asc' } ];

// 상태 변경·권한 판정에 필요한 문서 정보
const documentSelect = {
    id: true, requesterId: true, documentType: true, title: true, status: true, currentStepOrder: true, approvalLineTemplateId: true,
    requester: { select: { name: true } },
    steps: { select: { id: true, approverId: true, stepOrder: true, status: true, approverName: true }, orderBy: STEP_ORDER_BY },
} satisfies Prisma.ApprovalDocumentSelect;

type DocumentRow = Prisma.ApprovalDocumentGetPayload<{ select: typeof documentSelect }>;

// 목록 항목
const listSelect = {
    id: true, documentType: true, title: true, status: true, currentStepOrder: true,
    requestedAt: true, completedAt: true, createdAt: true, updatedAt: true,
    requester: { select: { id: true, name: true } },
    steps: { select: { stepOrder: true, approverId: true, approverName: true, status: true, actedAt: true }, orderBy: STEP_ORDER_BY },
} satisfies Prisma.ApprovalDocumentSelect;

const STATUS_LABEL: Record<ApprovalStatus, string> = {
    DRAFT: '임시저장', CANCELLED: '회수', REQUESTED: '결재요청', IN_PROGRESS: '결재중', APPROVED: '승인', REJECTED: '반려',
};

//! 전자결재 문서 (features.md 7.3~7.5, 2026-11-10 사용자 결정)
// 상태 전이:  DRAFT ─상신→ REQUESTED ─첫 승인→ IN_PROGRESS ─마지막 단계 완료→ APPROVED
//                          ├ 회수(기안자, 아무도 승인하기 전까지) → CANCELLED
//                          └ 반려(현재 단계 결재자, 의견 필수) ─────────────→ REJECTED
// - 단계 = 같은 stepOrder의 결재자들. 한 단계에 여러 명이면 병렬: 모두 승인해야 다음 단계, 한 명이라도 반려하면 문서 반려.
//   currentStepOrder = 지금 단계 번호, 그 단계의 결재자 모두가 PENDING이다.
// - 결재라인은 상신할 때 검사하고 결재자 정보(이름·주 소속 부서·직급·직책)를 스냅샷으로 저장한다. 이후 인사이동과 무관하다.
// - 결재자는 자기 차례(PENDING)만 처리한다. 반려·회수된 문서는 고치지 않고 "다시 기안"(복사 → 새 DRAFT)한다.
// ⭐ 동시 처리: 모든 상태 변경은 같은 순서로 실행한다.
//   ① 문서 행을 "기대한 상태·단계" 조건으로 UPDATE (행 잠금) → 0행이면 409
//   ② 단계 행을 "기대한 상태·결재자" 조건으로 UPDATE → 0행이면 409 (트랜잭션 전체 롤백)
//   승인·반려·회수·결재자 교체가 모두 문서 행을 먼저 잠그므로, 서로 겹쳐도 차례대로 실행되고 교착(deadlock)이 생기지 않는다.
//   같은 단계의 두 사람이 동시에 승인해도 뒤의 요청은 앞 요청이 커밋된 뒤 남은 인원을 세므로, 마지막 승인자만 다음 단계를 연다.
//   마지막 방어선: DB exclusion constraint (같은 문서의 PENDING 행은 모두 같은 단계 번호)
// - 최종 승인·상신 시 문서 유형별 처리기를 같은 tx로 호출한다. (휴가 등 업무 반영이 승인과 함께 커밋·롤백)
// - 상태가 바뀌는 동작마다 ApprovalDocumentHistory(업무 이력)와 감사 로그를 남기고, 알림은 커밋 후 보낸다.
@Injectable()
export class ApprovalDocumentsService {

    private readonly audit: TargetAudit;

    constructor(
        private readonly prisma: PrismaService,
        private readonly registry: ApprovalHandlerRegistry,
        private readonly approvers: ApproversService,
        private readonly lines: ApprovalLinesService,
        private readonly filesService: FilesService,
        private readonly notifier: ApprovalNotifier,
        auditService: AuditService,
    ){
        this.audit = auditService.target( AuditTargetType.APPROVAL );
    }

    //! 조회

    //* 쓸 수 있는 문서 유형 (처리기가 등록된 것)
    documentTypes(){
        return this.registry.list();
    }

    //* 결재함
    async findList( user: Actor, query: ApprovalDocumentListQueryDto ){
        if ( query.box === ApprovalBox.PROCESSED ) {
            return this.findProcessed( user, query );
        }

        const notDraft = query.status !== undefined && query.status !== ApprovalStatus.DRAFT ? query.status : { not: ApprovalStatus.DRAFT };

        let where: Prisma.ApprovalDocumentWhereInput;
        let orderBy: Prisma.ApprovalDocumentOrderByWithRelationInput[];

        switch ( query.box ) {
            case ApprovalBox.DRAFTS:
                where = this.boxWhere( user, ApprovalBox.DRAFTS );
                orderBy = [ { updatedAt: 'desc' }, { id: 'desc' } ];
                break;
            case ApprovalBox.MINE:
                where = { requesterId: user.id, status: notDraft, deleted: false };
                orderBy = [ { requestedAt: 'desc' }, { id: 'desc' } ];
                break;
            case ApprovalBox.PENDING:
                where = this.boxWhere( user, ApprovalBox.PENDING );
                orderBy = [ { requestedAt: 'asc' }, { id: 'asc' } ]; // 먼저 온 문서부터
                break;
            case ApprovalBox.UPCOMING:
                where = this.boxWhere( user, ApprovalBox.UPCOMING );
                orderBy = [ { requestedAt: 'asc' }, { id: 'asc' } ];
                break;
            case ApprovalBox.ALL:
                if ( user.role !== UserRole.ADMIN ) {
                    throw new ForbiddenException( '관리자만 전체 문서를 볼 수 있습니다.' );
                }
                where = { status: notDraft, deleted: false }; // 남의 임시저장은 기안자만 본다
                orderBy = [ { requestedAt: 'desc' }, { id: 'desc' } ];
                break;
        }

        return PaginatePage( query,
            ( page ) => this.prisma.approvalDocument.findMany({ where, select: listSelect, orderBy, ...page }),
            () => this.prisma.approvalDocument.count({ where }),
        );
    }

    //* 결재함 탭 건수 (2026-11-10 사용자 결정) - 확인할 것만 센다
    // 결재 대기·결재 예정·임시저장 = 목록 전체 개수와 같음 / 기안함 = 결재요청·결재중인 내 문서만 (목록은 완료·반려·회수까지 보임)
    async counts( user: Actor ){
        const [ pending, upcoming, mine, drafts ] = await Promise.all([
            this.prisma.approvalDocument.count({ where: this.boxWhere( user, ApprovalBox.PENDING ) }),
            this.prisma.approvalDocument.count({ where: this.boxWhere( user, ApprovalBox.UPCOMING ) }),
            this.prisma.approvalDocument.count({ where: { requesterId: user.id, status: { in: IN_PROGRESS_STATUSES }, deleted: false } }),
            this.prisma.approvalDocument.count({ where: this.boxWhere( user, ApprovalBox.DRAFTS ) }),
        ]);
        return { pending, upcoming, mine, drafts };
    }

    //* 결재함 조건 (목록·건수 공용 - 같은 조건을 두 곳에 쓰지 않게)
    private boxWhere( user: Actor, box: typeof ApprovalBox.PENDING | typeof ApprovalBox.UPCOMING | typeof ApprovalBox.DRAFTS ): Prisma.ApprovalDocumentWhereInput {
        switch ( box ) {
            case ApprovalBox.PENDING:
                return { status: { in: IN_PROGRESS_STATUSES }, steps: { some: { approverId: user.id, status: ApprovalStepStatus.PENDING } }, deleted: false };
            case ApprovalBox.UPCOMING:
                return { status: { in: IN_PROGRESS_STATUSES }, steps: { some: { approverId: user.id, status: ApprovalStepStatus.WAITING } }, deleted: false };
            case ApprovalBox.DRAFTS:
                return { requesterId: user.id, status: ApprovalStatus.DRAFT, deleted: false };
        }
    }

    //* 결재 완료함: 내가 승인·반려한 단계 기준 (내가 처리한 시각 최신 순)
    private async findProcessed( user: Actor, query: ApprovalDocumentListQueryDto ){
        const where: Prisma.ApprovalDocumentStepWhereInput = {
            approverId: user.id,
            status: { in: [ ApprovalStepStatus.APPROVED, ApprovalStepStatus.REJECTED ] },
            approvalDocument: { deleted: false, ...( query.status !== undefined && { status: query.status } ) },
        };

        const result = await PaginatePage( query,
            ( page ) => this.prisma.approvalDocumentStep.findMany({
                where,
                select: { status: true, actedAt: true, approvalDocument: { select: listSelect } },
                orderBy: [ { actedAt: 'desc' }, { id: 'desc' } ],
                ...page,
            }),
            () => this.prisma.approvalDocumentStep.count({ where }),
        );

        return {
            ...result,
            data: result.data.map( ( s ) => ({ ...s.approvalDocument, myStep: { status: s.status, actedAt: s.actedAt } }) ),
        };
    }

    //* 상세 (기안자 + 결재라인 전원 + 관리자, DRAFT는 기안자만)
    async findOne( user: Actor, id: number ){
        await this.findVisible( user, id );

        const doc = await this.prisma.approvalDocument.findUniqueOrThrow({
            where: { id },
            select: {
                id: true, documentType: true, title: true, content: true, status: true, currentStepOrder: true,
                requestedAt: true, completedAt: true, createdAt: true, updatedAt: true,
                requester: { select: { id: true, name: true, empNo: true } },
                sourceTemplate: { select: { id: true, name: true } },
                steps: {
                    select: {
                        id: true, stepOrder: true, approverId: true, status: true, comment: true, actedAt: true,
                        approverName: true, departmentName: true, positionName: true, jobTitleName: true,
                    },
                    orderBy: STEP_ORDER_BY,
                },
                histories: {
                    select: { id: true, fromStatus: true, toStatus: true, comment: true, createdAt: true, actor: { select: { id: true, name: true } } },
                    orderBy: [ { createdAt: 'asc' }, { id: 'asc' } ],
                },
            },
        });

        // 남은 단계 결재자가 지금도 결재할 수 있는지 ("결재자 삭제됨" 표시 → 관리자 교체)
        const remaining = doc.steps.filter( ( s ) => s.status === ApprovalStepStatus.PENDING || s.status === ApprovalStepStatus.WAITING );
        const current = await this.approvers.load( remaining.map( ( s ) => s.approverId ) );

        const isRequester = doc.requester.id === user.id;
        const inProgress = IN_PROGRESS_STATUSES.includes( doc.status );
        const myTurn = inProgress && doc.steps.some( ( s ) => s.approverId === user.id && s.status === ApprovalStepStatus.PENDING );

        return {
            ...doc,
            steps: doc.steps.map( ( s ) => ({
                ...s,
                approverUsable: s.status === ApprovalStepStatus.PENDING || s.status === ApprovalStepStatus.WAITING
                    ? current.get( s.approverId )?.usable ?? false
                    : null,
            }) ),
            histories: doc.histories.map( ( h ) => ({ ...h, id: h.id.toString() }) ), // BigInt → 문자열
            files: await this.filesService.listByTarget( FileTargetType.APPROVAL_DOCUMENT, id ),
            permissions: {
                canEdit: isRequester && doc.status === ApprovalStatus.DRAFT,          // 수정·삭제·상신
                canCancel: isRequester && doc.status === ApprovalStatus.REQUESTED,
                canApprove: myTurn,                                                 // 승인·반려
                canCopy: isRequester && ( doc.status === ApprovalStatus.REJECTED || doc.status === ApprovalStatus.CANCELLED ),
                canReplaceApprover: user.role === UserRole.ADMIN && inProgress,
            },
        };
    }

    //* 첨부 다운로드 (열람 권한 확인 후)
    async openAttachment( user: Actor, id: number, fileId: number ){
        await this.findVisible( user, id );
        return this.filesService.openTargetFile( fileId, FileTargetType.APPROVAL_DOCUMENT, id );
    }

    //! 임시저장 (DRAFT)

    async create( user: Actor, body: CreateApprovalDocumentDto ){
        const handler = this.registry.get( body.documentType );
        if ( !handler.directCreate ) {
            throw new BadRequestException( '이 문서 유형은 해당 업무 화면에서 신청합니다.' );
        }

        const id = await this.createWithData( user, body, '결재 문서 임시저장' );
        return this.findOne( user, id );
    }

    //* 업무 옵션(휴가 등)용 임시저장: 문서와 업무 데이터(writeData)를 같은 트랜잭션에서 만든다 → 새 문서 id
    // 결재 본체는 업무 데이터가 무엇인지 모른다. 처리기가 등록된 유형만 만들 수 있다.
    async createWithData( user: Actor, body: CreateApprovalDocumentDto, auditLabel: string, writeData?: DraftDataWriter ){
        this.registry.get( body.documentType );
        if ( body.approvalLineTemplateId ) {
            await this.lines.assertUsableTemplate( user, body.approvalLineTemplateId );
        }

        return this.createDraft( user, {
            documentType: body.documentType,
            title: body.title,
            content: body.content ?? null,
            groups: ( body.steps ?? [] ).map( ( s ) => s.approverIds ),
            approvalLineTemplateId: body.approvalLineTemplateId ?? null,
            attachmentIds: body.attachmentIds ?? [],
        }, auditLabel, writeData );
    }

    async update( user: Actor, id: number, body: UpdateApprovalDocumentDto ){
        const doc = await this.findMyDocument( user, id );
        if ( !this.registry.get( doc.documentType ).directCreate ) {
            throw new BadRequestException( '이 문서 유형은 해당 업무 화면에서 수정합니다.' );
        }

        await this.updateWithData( user, id, doc.documentType, body );
        return this.findOne( user, id );
    }

    //* 업무 옵션(휴가 등)용 임시저장 수정: 문서와 업무 데이터(writeData)를 같은 트랜잭션에서 고친다
    // documentType이 다르면 404 (휴가 API로 일반 문서를 고치지 못하게)
    async updateWithData( user: Actor, id: number, documentType: HandledDocument['documentType'], body: UpdateApprovalDocumentDto, writeData?: DraftDataWriter ){
        const doc = await this.findMyDocument( user, id );
        if ( doc.documentType !== documentType ) {
            throw new NotFoundException( '존재하지 않는 결재 문서입니다.' );
        }
        this.assertStatus( doc, [ ApprovalStatus.DRAFT ], '임시저장 문서만 수정할 수 있습니다.' );

        const groups = body.steps?.map( ( s ) => s.approverIds );
        const rows = groups !== undefined ? await this.checkDraftSteps( user, groups ) : undefined;
        if ( body.approvalLineTemplateId ) {
            await this.lines.assertUsableTemplate( user, body.approvalLineTemplateId );
        }

        await this.prisma.$transaction( async ( tx ) => {
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, requesterId: user.id, status: ApprovalStatus.DRAFT, deleted: false },
                data: {
                    title: body.title,
                    ...( body.content !== undefined && { content: this.toContent( body.content ) } ),
                    approvalLineTemplateId: body.approvalLineTemplateId,
                    updatedId: user.id,
                },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            if ( rows !== undefined ) {
                await tx.approvalDocumentStep.deleteMany({ where: { approvalDocumentId: id } });
                await tx.approvalDocumentStep.createMany({ data: rows.map( ( r ) => ({ ...r, approvalDocumentId: id }) ) });
            }

            if ( body.attachmentIds !== undefined ) {
                await this.syncAttachments( tx, id, user.id, body.attachmentIds );
            }

            await writeData?.( tx, id );

            await this.audit.updated( tx, id, `결재 문서 수정: ${body.title ?? doc.title}`, diffChanges(
                { title: doc.title, steps: groupSteps( doc.steps ) },
                { title: body.title ?? doc.title, steps: groups ?? groupSteps( doc.steps ) },
            ), body.attachmentIds !== undefined ? { attachmentIds: body.attachmentIds } : undefined );
        });
    }

    async delete( user: Actor, id: number ){
        const doc = await this.findMyDocument( user, id );
        this.assertStatus( doc, [ ApprovalStatus.DRAFT ], '임시저장 문서만 삭제할 수 있습니다.' );

        await this.prisma.$transaction( async ( tx ) => {
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, status: ApprovalStatus.DRAFT, deleted: false },
                data: { deleted: true, deletedAt: new Date(), deletedId: user.id, updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            await this.filesService.softDeleteByTarget( tx, [ FileTargetType.APPROVAL_DOCUMENT ], id, user.id );
            await this.audit.deleted( tx, id, `결재 문서 삭제(임시저장): ${doc.title}` );
        });
    }

    //* 다시 기안: 반려·회수된 문서를 새 DRAFT로 복사 (원래 문서는 그대로 남아 반려 사유가 보존된다)
    // 지금 결재자로 지정할 수 없는 회원(퇴사 등)은 빼고 복사한다. (그래서 비게 된 단계는 없앤다) → 새 문서 상세
    async copy( user: Actor, id: number ){
        const doc = await this.findMyDocument( user, id );
        this.assertStatus( doc, [ ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED ], '반려되거나 회수한 문서만 다시 기안할 수 있습니다.' );

        const handler = this.registry.get( doc.documentType );
        if ( !handler.directCreate && !handler.onCopy ) {
            throw new BadRequestException( '이 문서 유형은 해당 업무 화면에서 다시 신청합니다.' );
        }

        const source = await this.prisma.approvalDocument.findUniqueOrThrow({ where: { id }, select: { content: true } });
        const current = await this.approvers.load( doc.steps.map( ( s ) => s.approverId ) );
        const groups = groupSteps( doc.steps )
            .map( ( g ) => g.filter( ( a ) => current.get( a )?.usable ) )
            .filter( ( g ) => g.length > 0 );
        // 지금은 불러올 수 없는 템플릿(삭제·부서 이동 등)이면 기록만 비운다
        const templateId = doc.approvalLineTemplateId !== null
            && ( await this.lines.findUsable( user ) ).some( ( l ) => l.id === doc.approvalLineTemplateId ) ? doc.approvalLineTemplateId : null;
        const attachmentIds = await this.filesService.duplicateAttachments( FileTargetType.APPROVAL_DOCUMENT, id, user.id );

        const newId = await this.createDraft( user, {
            documentType: doc.documentType,
            title: doc.title,
            content: source.content,
            groups,
            approvalLineTemplateId: templateId,
            attachmentIds,
        }, `결재 문서 다시 기안(원본 ${id})`, handler.onCopy && ( ( tx, newId ) => handler.onCopy!( tx, id, newId ) ) );

        return this.findOne( user, newId );
    }

    //! 상태 변경

    //* 상신: DRAFT → REQUESTED, 1단계 결재자 모두 PENDING
    async submit( user: Actor, id: number ){
        const doc = await this.findMyDocument( user, id );
        this.assertStatus( doc, [ ApprovalStatus.DRAFT ], '임시저장 문서만 상신할 수 있습니다.' );
        const handler = this.registry.get( doc.documentType ); // 꺼진 업무의 문서는 상신할 수 없다

        const firstApproverIds = await this.prisma.$transaction( async ( tx ) => {
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, requesterId: user.id, status: ApprovalStatus.DRAFT, deleted: false },
                data: { status: ApprovalStatus.REQUESTED, currentStepOrder: 1, requestedAt: new Date(), updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            // 잠근 뒤 단계를 다시 읽어 검사한다 (임시저장 이후 결재자가 퇴사했을 수 있음)
            const steps = await tx.approvalDocumentStep.findMany({ where: { approvalDocumentId: id }, orderBy: STEP_ORDER_BY });
            const error = checkStepGroups( groupSteps( steps ), { minSteps: 1, requesterId: user.id } );
            if ( error ) throw new BadRequestException( error );
            const approvers = await this.approvers.loadUsable( steps.map( ( s ) => s.approverId ), tx );

            // 스냅샷을 상신 시점 정보로 다시 채운다 (저장 시 단계 번호는 1부터 빈틈없이 매긴다)
            for ( const [ i, step ] of steps.entries() ) {
                await tx.approvalDocumentStep.update({
                    where: { id: step.id },
                    data: {
                        ...ApproversService.snapshot( approvers[i] ),
                        status: step.stepOrder === 1 ? ApprovalStepStatus.PENDING : ApprovalStepStatus.WAITING,
                        comment: null,
                        actedAt: null,
                    },
                });
            }

            await handler.onSubmit?.( tx, this.handled( doc ) );

            await this.history( tx, id, user.id, ApprovalStatus.DRAFT, ApprovalStatus.REQUESTED, null );
            await this.statusAudit( tx, doc, ApprovalStatus.DRAFT, ApprovalStatus.REQUESTED, '상신' );

            return steps.filter( ( s ) => s.stepOrder === 1 ).map( ( s ) => s.approverId );
        });

        await this.notifier.requested( this.notified( doc ), firstApproverIds, user.id );
        return this.findOne( user, id );
    }

    //* 회수: REQUESTED → CANCELLED (기안자, 아무도 승인하기 전까지)
    async cancel( user: Actor, id: number ){
        const doc = await this.findMyDocument( user, id );
        if ( doc.status === ApprovalStatus.IN_PROGRESS ) {
            throw new ConflictException( '승인이 진행된 문서는 회수할 수 없습니다. 결재자에게 반려를 요청하세요.' );
        }
        this.assertStatus( doc, [ ApprovalStatus.REQUESTED ], '결재요청 상태의 문서만 회수할 수 있습니다.' );

        await this.prisma.$transaction( async ( tx ) => {
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, requesterId: user.id, status: ApprovalStatus.REQUESTED, deleted: false },
                data: { status: ApprovalStatus.CANCELLED, currentStepOrder: null, updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            // 차례였던 결재자들의 결재 대기함에서 빠지도록 대기 상태로 되돌린다
            await tx.approvalDocumentStep.updateMany({
                where: { approvalDocumentId: id, status: ApprovalStepStatus.PENDING },
                data: { status: ApprovalStepStatus.WAITING },
            });

            await this.history( tx, id, user.id, ApprovalStatus.REQUESTED, ApprovalStatus.CANCELLED, null );
            await this.statusAudit( tx, doc, ApprovalStatus.REQUESTED, ApprovalStatus.CANCELLED, '회수' );
        });

        return this.findOne( user, id );
    }

    //* 승인: 내 단계 APPROVED → 같은 단계가 모두 승인되면 다음 단계 PENDING, 마지막 단계면 처리기 호출 + APPROVED
    async approve( user: Actor, id: number, body: ApproveDocumentDto ){
        const doc = await this.findVisible( user, id );
        const step = this.myCurrentStep( user, doc );
        const handler = this.registry.get( doc.documentType );

        const result = await this.prisma.$transaction( async ( tx ) => {
            // ① 문서 행 먼저 (회수·다른 승인·결재자 교체와 같은 순서로 잠근다)
            //    같은 단계의 다른 결재자가 동시에 승인하면 여기서 기다렸다가, 앞 승인이 커밋된 상태를 보고 이어간다.
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, status: { in: IN_PROGRESS_STATUSES }, currentStepOrder: step.stepOrder, deleted: false },
                data: { updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            // ② 내 단계 (그사이 결재자가 교체됐으면 0행)
            const stepResult = await tx.approvalDocumentStep.updateMany({
                where: { id: step.id, approverId: user.id, status: ApprovalStepStatus.PENDING },
                data: { status: ApprovalStepStatus.APPROVED, comment: body.comment ?? null, actedAt: new Date() },
            });
            if ( stepResult.count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            // ③ 잠근 뒤의 현재 상태로 판단 (같은 단계의 앞선 승인이 반영된 값)
            const locked = await tx.approvalDocument.findUniqueOrThrow({ where: { id }, select: { status: true } });
            const waitingInStep = await tx.approvalDocumentStep.count({
                where: { approvalDocumentId: id, stepOrder: step.stepOrder, status: { not: ApprovalStepStatus.APPROVED } },
            });

            let toStatus: ApprovalStatus = ApprovalStatus.IN_PROGRESS;
            let nextApproverIds: number[] = [];

            if ( waitingInStep > 0 ) {
                // 같은 단계에 아직 승인하지 않은 사람이 있다 → 단계 유지 (첫 승인이면 결재중으로)
                await tx.approvalDocument.update({ where: { id }, data: { status: ApprovalStatus.IN_PROGRESS } });
            } else {
                const next = nextAfterApprove( doc.steps.map( ( s ) => s.stepOrder ), step.stepOrder );
                toStatus = next.status;

                if ( next.nextOrder !== null ) {
                    await tx.approvalDocument.update({ where: { id }, data: { status: ApprovalStatus.IN_PROGRESS, currentStepOrder: next.nextOrder } });
                    await tx.approvalDocumentStep.updateMany({
                        where: { approvalDocumentId: id, stepOrder: next.nextOrder, status: ApprovalStepStatus.WAITING },
                        data: { status: ApprovalStepStatus.PENDING },
                    });
                    // 알림 대상은 잠근 뒤 다시 읽는다 (트랜잭션 전에 읽은 값이면 그사이 교체된 결재자에게 알림이 갈 수 있다)
                    nextApproverIds = ( await tx.approvalDocumentStep.findMany({
                        where: { approvalDocumentId: id, stepOrder: next.nextOrder },
                        select: { approverId: true },
                    }) ).map( ( s ) => s.approverId );
                } else {
                    // 최종 승인 → 업무 반영 (예외가 나면 승인 전체가 롤백된다)
                    await handler.onFinalApproved?.( tx, this.handled( doc ) );
                    await tx.approvalDocument.update({
                        where: { id },
                        data: { status: ApprovalStatus.APPROVED, currentStepOrder: null, completedAt: new Date() },
                    });
                }
            }

            await this.history( tx, id, user.id, locked.status, toStatus, body.comment ?? null );
            await this.statusAudit( tx, doc, locked.status, toStatus,
                toStatus === ApprovalStatus.APPROVED ? `최종 승인(${step.stepOrder}단계)` : `승인(${step.stepOrder}단계)` );

            return { toStatus, nextApproverIds };
        });

        if ( result.nextApproverIds.length > 0 ) {
            await this.notifier.requested( this.notified( doc ), result.nextApproverIds, user.id );
        } else if ( result.toStatus === ApprovalStatus.APPROVED ) {
            await this.notifier.approved( this.notified( doc ), user.id );
        }

        return this.findOne( user, id );
    }

    //* 반려: 내 단계 REJECTED + 문서 REJECTED (같은 단계의 나머지·이후 단계는 진행하지 않는다)
    async reject( user: Actor, id: number, body: RejectDocumentDto ){
        const doc = await this.findVisible( user, id );
        const step = this.myCurrentStep( user, doc );

        await this.prisma.$transaction( async ( tx ) => {
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, status: { in: IN_PROGRESS_STATUSES }, currentStepOrder: step.stepOrder, deleted: false },
                data: { status: ApprovalStatus.REJECTED, currentStepOrder: null, completedAt: new Date(), updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            const stepResult = await tx.approvalDocumentStep.updateMany({
                where: { id: step.id, approverId: user.id, status: ApprovalStepStatus.PENDING },
                data: { status: ApprovalStepStatus.REJECTED, comment: body.comment, actedAt: new Date() },
            });
            if ( stepResult.count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            // 같은 단계에서 아직 처리하지 않은 사람은 결재 대기함에서 빠지도록 대기 상태로
            await tx.approvalDocumentStep.updateMany({
                where: { approvalDocumentId: id, status: ApprovalStepStatus.PENDING },
                data: { status: ApprovalStepStatus.WAITING },
            });

            await this.history( tx, id, user.id, doc.status, ApprovalStatus.REJECTED, body.comment );
            await this.statusAudit( tx, doc, doc.status, ApprovalStatus.REJECTED, `반려(${step.stepOrder}단계)` );
        });

        await this.notifier.rejected( this.notified( doc ), user.id, body.comment );
        return this.findOne( user, id );
    }

    //* 관리자 결재자 교체: 진행 중 문서의 남은 결재자(PENDING·WAITING) 한 명 (퇴사·휴직·삭제된 결재자 대응)
    async replaceApprover( user: Actor, id: number, stepId: number, body: ReplaceApproverDto ){
        const doc = await this.findDocument( id );
        if ( !IN_PROGRESS_STATUSES.includes( doc.status ) ) {
            throw new ConflictException( '결재가 진행 중인 문서만 결재자를 바꿀 수 있습니다.' );
        }

        const step = doc.steps.find( ( s ) => s.id === stepId );
        if ( !step ) {
            throw new NotFoundException( '존재하지 않는 결재 단계입니다.' );
        }
        if ( step.status !== ApprovalStepStatus.PENDING && step.status !== ApprovalStepStatus.WAITING ) {
            throw new ConflictException( '이미 처리된 결재자는 바꿀 수 없습니다.' );
        }
        if ( step.approverId === body.approverId ) {
            throw new BadRequestException( '지금과 같은 결재자입니다.' );
        }

        const others = doc.steps.filter( ( s ) => s.id !== step.id ).map( ( s ) => s.approverId );
        const error = checkApproverIds( [ ...others, body.approverId ], { minSteps: 1, requesterId: doc.requesterId } );
        if ( error ) throw new BadRequestException( error );
        const [ approver ] = await this.approvers.loadUsable( [ body.approverId ] );

        await this.prisma.$transaction( async ( tx ) => {
            // 문서 행 먼저 잠근다 (같은 결재자의 승인과 겹치면 한쪽만 성공)
            const { count } = await tx.approvalDocument.updateMany({
                where: { id, status: { in: IN_PROGRESS_STATUSES }, deleted: false },
                data: { updatedId: user.id },
            });
            if ( count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            const stepResult = await tx.approvalDocumentStep.updateMany({
                where: { id: step.id, approverId: step.approverId, status: step.status },
                data: { approverId: approver.id, ...ApproversService.snapshot( approver ) },
            });
            if ( stepResult.count === 0 ) throw new ConflictException( STATE_CHANGED_MESSAGE );

            const comment = `결재자 변경(${step.stepOrder}단계): ${step.approverName} → ${approver.name}`;
            await this.history( tx, id, user.id, doc.status, doc.status, comment );
            await this.audit.updated( tx, id, `결재자 교체: ${doc.title} - ${comment}`, {
                [`step${step.id}.approverId`]: { before: step.approverId, after: approver.id },
            });
        });

        // 지금 차례였던 결재자면 새 결재자에게 알린다
        if ( step.status === ApprovalStepStatus.PENDING ) {
            await this.notifier.requested( this.notified( doc ), [ approver.id ], user.id );
        }

        return this.findOne( user, id );
    }

    //! 내부

    //* 임시저장 문서 만들기 (작성·다시 기안 공용) → 새 문서 id
    private async createDraft(
        user: Actor,
        data: {
            documentType: HandledDocument['documentType'];
            title: string;
            content: string | null;
            groups: number[][];
            approvalLineTemplateId: number | null;
            attachmentIds: number[];
        },
        auditLabel: string,
        writeData?: DraftDataWriter,
    ){
        const rows = await this.checkDraftSteps( user, data.groups );

        return this.prisma.$transaction( async ( tx ) => {
            const doc = await tx.approvalDocument.create({
                data: {
                    requesterId: user.id,
                    documentType: data.documentType,
                    title: data.title,
                    content: this.toContent( data.content ),
                    approvalLineTemplateId: data.approvalLineTemplateId,
                    createdId: user.id,
                    updatedId: user.id,
                    steps: { create: rows },
                },
                select: { id: true },
            });

            await this.syncAttachments( tx, doc.id, user.id, data.attachmentIds );
            await writeData?.( tx, doc.id );
            await this.history( tx, doc.id, user.id, null, ApprovalStatus.DRAFT, null );
            await this.audit.created( tx, doc.id, `${auditLabel}: ${data.title}`, {
                documentType: data.documentType, steps: data.groups, attachmentIds: data.attachmentIds,
            });

            return doc.id;
        });
    }

    // 임시저장 단계 검사 → 저장할 단계 행 (단계 번호 1부터, 같은 단계 = 같은 번호)
    // 0명 허용, 빈 단계 불가, 전체 최대 10명, 중복·본인 불가, 지정 가능한 회원
    private async checkDraftSteps( user: Actor, groups: number[][] ){
        const error = checkStepGroups( groups, { minSteps: 0, requesterId: user.id } );
        if ( error ) throw new BadRequestException( error );

        const approvers = await this.approvers.loadUsable( groups.flat() );
        const byId = new Map<number, ApproverInfo>( approvers.map( ( a ) => [ a.id, a ] ) );

        return groups.flatMap( ( g, i ) => g.map( ( approverId ) => ({
            approverId,
            stepOrder: i + 1,
            ...ApproversService.snapshot( byId.get( approverId )! ),
        }) ) );
    }

    // 본문 정제 (게시판과 같은 허용 목록, 본문 이미지는 쓰지 않음 - 공개 uuid 주소라 결재 문서에 맞지 않음)
    private toContent( content: string | null | undefined ){
        return sanitizeEditorHtml( content, { allowImage: () => false } ).html;
    }

    private syncAttachments( tx: Tx, id: number, userId: number, fileIds: number[] ){
        return this.filesService.syncTargetFiles( tx, {
            kind: FileKind.ATTACHMENT,
            targetType: FileTargetType.APPROVAL_DOCUMENT,
            targetId: id,
            fileIds,
            userId,
        });
    }

    private async findDocument( id: number ): Promise<DocumentRow> {
        const doc = await this.prisma.approvalDocument.findFirst({ where: { id, deleted: false }, select: documentSelect });
        if ( !doc ) {
            throw new NotFoundException( '존재하지 않는 결재 문서입니다.' );
        }
        return doc;
    }

    //* 업무 옵션(휴가 등)이 문서에 딸린 업무 데이터를 보여 주기 전에 쓰는 열람 권한 확인 (볼 수 없으면 404)
    async assertVisible( user: Actor, id: number ){
        const doc = await this.findVisible( user, id );
        return { id: doc.id, documentType: doc.documentType, status: doc.status, requesterId: doc.requesterId };
    }

    //* 볼 수 있는 문서 (기안자 + 결재라인 전원 + 관리자, DRAFT는 기안자만) - 아니면 404
    private async findVisible( user: Actor, id: number ): Promise<DocumentRow> {
        const doc = await this.findDocument( id );
        const isRequester = doc.requesterId === user.id;
        const visible = doc.status === ApprovalStatus.DRAFT
            ? isRequester
            : isRequester || user.role === UserRole.ADMIN || doc.steps.some( ( s ) => s.approverId === user.id );

        if ( !visible ) {
            throw new NotFoundException( '존재하지 않는 결재 문서입니다.' );
        }
        return doc;
    }

    //* 내가 기안한 문서 (기안자가 아니면: 볼 수 있으면 403, 볼 수 없으면 404)
    private async findMyDocument( user: Actor, id: number ): Promise<DocumentRow> {
        const doc = await this.findVisible( user, id );
        if ( doc.requesterId !== user.id ) {
            throw new ForbiddenException( '기안자만 할 수 있습니다.' );
        }
        return doc;
    }

    //* 지금 내 차례인 행 (지금 단계에서 내 행이 PENDING) - 아니면 409/403
    private myCurrentStep( user: Actor, doc: DocumentRow ){
        if ( !IN_PROGRESS_STATUSES.includes( doc.status ) ) {
            throw new ConflictException( '결재가 진행 중인 문서가 아닙니다.' );
        }
        const step = doc.steps.find( ( s ) => s.approverId === user.id && s.stepOrder === doc.currentStepOrder );
        if ( !step || step.status !== ApprovalStepStatus.PENDING ) {
            // 이미 처리한 결재를 다시 누른 경우 (두 탭·연타로 늦게 도착한 요청)
            if ( doc.steps.some( ( s ) => s.approverId === user.id && ( s.status === ApprovalStepStatus.APPROVED || s.status === ApprovalStepStatus.REJECTED ) ) ) {
                throw new ConflictException( '이미 처리한 결재입니다.' );
            }
            throw new ForbiddenException( '내 차례인 문서만 승인·반려할 수 있습니다.' );
        }
        return step;
    }

    private assertStatus( doc: DocumentRow, allowed: ApprovalStatus[], message: string ){
        if ( !allowed.includes( doc.status ) ) {
            throw new ConflictException( message );
        }
    }

    private history( tx: Tx, id: number, actorId: number, fromStatus: ApprovalStatus | null, toStatus: ApprovalStatus, comment: string | null ){
        return tx.approvalDocumentHistory.create({
            data: { approvalDocumentId: id, actorId, fromStatus, toStatus, comment },
        });
    }

    private statusAudit( tx: Tx, doc: DocumentRow, from: ApprovalStatus, to: ApprovalStatus, action: string ){
        return this.audit.log({
            targetId: doc.id,
            actionType: AuditActionType.STATUS_CHANGE,
            content: `결재 ${action}: ${doc.title} (${STATUS_LABEL[from]} → ${STATUS_LABEL[to]})`,
            detail: { changes: { status: { before: from, after: to } } },
        }, tx );
    }

    private handled( doc: DocumentRow ): HandledDocument {
        return { id: doc.id, requesterId: doc.requesterId, documentType: doc.documentType, title: doc.title };
    }

    private notified( doc: DocumentRow ): NotifiedDocument {
        return { id: doc.id, title: doc.title, requesterId: doc.requesterId, requesterName: doc.requester.name };
    }
}
