import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ApprovalDocumentsController } from './approval-documents.controller';
import { ApprovalDocumentsService } from './approval-documents.service';
import { ApprovalHandlerRegistry, GeneralDocumentHandler } from './approval-handler.registry';
import { ApprovalLinesController } from './approval-lines.controller';
import { ApprovalLinesService } from './approval-lines.service';
import { ApprovalNotifier } from './approval-notifier';
import { ApproversService } from './approvers.service';
import { LineManagersController } from './line-managers.controller';
import { LineManagersService } from './line-managers.service';

//! 전자결재 (애드온 'approvals')
// 휴가 옵션(leaves)이 이 모듈을 import해 ApprovalHandlerRegistry에 처리기를 등록한다.
@Module({
    imports: [ PrismaModule, CommonModule ],
    controllers: [
        LineManagersController,
        ApprovalLinesController,
        ApprovalDocumentsController,
    ],
    providers: [
        ApprovalHandlerRegistry,
        GeneralDocumentHandler,
        ApproversService,
        LineManagersService,
        ApprovalLinesService,
        ApprovalDocumentsService,
        ApprovalNotifier,
    ],
    exports: [ ApprovalHandlerRegistry, ApprovalDocumentsService ], // 휴가 옵션이 쓴다
})
export class ApprovalsModule {}
