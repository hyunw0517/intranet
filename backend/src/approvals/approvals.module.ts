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

//! 전자결재 (애드온 'approvals') - AppModule에서 addonModule('approvals', ApprovalsModule)로만 등록한다.
// 핵심(common)의 파일·감사 로그·알림을 직접 쓰고, 핵심의 회원·조직 데이터는 읽기만 한다. (핵심은 이 모듈을 모른다)
// 휴가 옵션(leaves)은 이 모듈을 import해 ApprovalHandlerRegistry에 자기 문서 유형 처리기를 등록한다. (features.md 7.4)
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
    exports: [ ApprovalHandlerRegistry ],
})
export class ApprovalsModule {}
