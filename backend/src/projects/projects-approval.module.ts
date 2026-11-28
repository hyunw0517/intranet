import { Module } from '@nestjs/common';
import { ApprovalsModule } from 'src/approvals/approvals.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProjectsModule } from './projects.module';
import { QuoteApprovalService, QuoteDocumentHandler } from './quotes/quote-approval';
import { QuoteApprovalController } from './quotes/quote-approval.controller';

//! 과제 관리 ↔ 결재 연결 (projects·approvals가 둘 다 켜졌을 때만 등록)
// 둘 다 켜지면 견적서를 결재에 올리고 최종 승인 처리기가 같은 트랜잭션에서 확정한다.
// 결재가 꺼지면 이 모듈이 없어서 과제 관리에서 직접 확정한다(ProjectQuotesService.confirm).
// ProjectsModule이 결재를 직접 import하면 결재를 끈 배포에도 결재 API가 생겨서 연결은 여기에만 둔다.
@Module({
    imports: [ PrismaModule, ProjectsModule, ApprovalsModule ],
    controllers: [ QuoteApprovalController ],
    providers: [ QuoteDocumentHandler, QuoteApprovalService ],
})
export class ProjectsApprovalModule {}
