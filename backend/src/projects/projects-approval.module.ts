import { Module } from '@nestjs/common';
import { ApprovalsModule } from 'src/approvals/approvals.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProjectsModule } from './projects.module';
import { QuoteApprovalService, QuoteDocumentHandler } from './quotes/quote-approval';
import { QuoteApprovalController } from './quotes/quote-approval.controller';

//! 과제 관리 ↔ 결재 연결 - AppModule에서 addonModule([ 'projects', 'approvals' ], ProjectsApprovalModule)로만 등록한다.
// 견적서 확정은 결재가 켜져 있을 때만 결재와 연동한다. (2026-11-16 사용자 결정, docs/design/projects.md 5-1장)
//   - 둘 다 켜짐: 견적서를 결재에 올리고(QuoteApprovalController), 최종 승인 처리기(QuoteDocumentHandler.onFinalApproved)가 같은 트랜잭션에서 확정한다.
//   - 결재 꺼짐: 이 모듈이 등록되지 않는다 → 처리기·상신 API가 없고, 과제 관리에서 직접 확정한다(ProjectQuotesService.confirm).
// ProjectsModule이 ApprovalsModule을 직접 import하면 결재를 끈 배포에서도 결재 API가 생기므로, 연결은 이 모듈에만 둔다.
// 이 모듈이 등록하는 파일(quotes/quote-approval.ts)만 결재를 import한다. (하네스 boundaries allow: projects->approvals)
@Module({
    imports: [ PrismaModule, ProjectsModule, ApprovalsModule ],
    controllers: [ QuoteApprovalController ],
    providers: [ QuoteDocumentHandler, QuoteApprovalService ],
})
export class ProjectsApprovalModule {}
