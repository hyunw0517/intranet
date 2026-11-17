import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { ApprovalDocumentHandler, ApprovalHandlerRegistry, HandledDocument } from 'src/approvals/approval-handler.registry';
import { ApprovalDocumentsService } from 'src/approvals/approval-documents.service';
import { MAX_APPROVAL_STEPS } from 'src/approvals/const/approval.const';
import { ApprovalStepInputDto } from 'src/approvals/dto/approval-line.dto';
import { ApprovalDocumentType, Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import type { ProjectActor } from '../project-access.service';
import { ProjectQuotesService } from './project-quotes.service';

//! 견적서 ↔ 전자결재 연결 - ProjectsApprovalModule에만 등록된다(과제 관리 + 결재가 둘 다 켜졌을 때만, docs/design/projects.md 5-1장)
// ProjectsModule은 결재를 import하지 않는다. 결재 본체도 견적을 import하지 않는다(처리기 등록 지점만 안다).

//* 견적서 문서(QUOTE) 처리기 - 휴가(LeaveDocumentHandler)와 같은 방식
// - directCreate: false → 결재 작성 화면에서 직접 만들 수 없고, 견적 화면의 [결재 요청]으로만 만든다
// - onCopy 없음 → 결재함의 "다시 기안" 불가. 반려되면 견적을 고쳐 견적 화면에서 다시 올린다
// - onFinalApproved: 그 버전을 같은 트랜잭션에서 확정 (예외를 던지면 승인 전체가 롤백된다)
@Injectable()
export class QuoteDocumentHandler implements OnModuleInit, ApprovalDocumentHandler {

    readonly type = ApprovalDocumentType.QUOTE;
    readonly directCreate = false;

    constructor(
        private readonly registry: ApprovalHandlerRegistry,
        private readonly quotes: ProjectQuotesService,
    ){}

    onModuleInit(){
        this.registry.register( this );
    }

    onSubmit( tx: Prisma.TransactionClient, doc: HandledDocument ){
        return this.quotes.assertSubmittable( tx, doc.id );
    }

    onFinalApproved( tx: Prisma.TransactionClient, doc: HandledDocument ){
        return this.quotes.confirmByApproval( tx, doc.id, doc.requesterId );
    }
}

//* 결재 요청 본문 - 결재라인만 지정한다 (제목·본문은 서버가 견적에서 만든다)
export class SubmitQuoteDto {

    @IsArray()
    @ArrayMinSize(1, { message: '결재자를 1명 이상 지정해 주세요.' })
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    steps: ApprovalStepInputDto[];

    // 불러온 결재라인 템플릿 (기록용)
    @IsInt()
    @IsOptional()
    approvalLineTemplateId?: number | null;
}

//* 견적서 결재 상신
// 1) 견적 버전을 잠가 확인하고 제목·본문(견적 스냅샷 HTML)을 만든다
// 2) 결재 문서를 임시저장으로 만들면서 같은 트랜잭션에서 버전에 연결한다(이전 연결·수정 시각이 그대로일 때만)
// 3) 상신한다. 실패하면 방금 만든 임시저장 문서를 지운다(버전은 다시 "작성 중"으로 보인다)
@Injectable()
export class QuoteApprovalService {

    private readonly logger = new Logger( QuoteApprovalService.name );

    constructor(
        private readonly prisma: PrismaService,
        private readonly quotes: ProjectQuotesService,
        private readonly documents: ApprovalDocumentsService,
    ){}

    async submit( user: ProjectActor, projectId: number, quoteId: number, versionId: number, body: SubmitQuoteDto ) {
        const prepared = await this.prisma.$transaction( ( tx ) => this.quotes.prepareSubmission( tx, user, projectId, quoteId, versionId ) );

        const documentId = await this.documents.createWithData( user, {
            documentType: ApprovalDocumentType.QUOTE,
            title: prepared.title,
            content: prepared.content,
            steps: body.steps,
            approvalLineTemplateId: body.approvalLineTemplateId ?? null,
        }, '견적서 결재 임시저장', ( tx, docId ) =>
            this.quotes.linkApprovalDocument( tx, versionId, prepared.version.approvalDocumentId, prepared.version.updatedAt, docId ) );

        try {
            await this.documents.submit( user, documentId );
        } catch ( e ) {
            await this.documents.delete( user, documentId ).catch( ( err: unknown ) =>
                this.logger.error( `견적 결재 상신 실패 후 임시저장 문서(${documentId}) 삭제 실패`, err instanceof Error ? err.stack : String( err ) ) );
            throw e;
        }

        return { approvalDocumentId: documentId };
    }
}
