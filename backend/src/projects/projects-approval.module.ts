import { Module } from '@nestjs/common';
import { ApprovalsModule } from 'src/approvals/approvals.module';
import { ProjectsModule } from './projects.module';

//! 과제 관리 ↔ 결재 연결 - AppModule에서 addonModule([ 'projects', 'approvals' ], ProjectsApprovalModule)로만 등록한다.
// 견적서 확정은 결재가 켜져 있을 때만 결재와 연동한다. (2026-11-16 사용자 결정, docs/design/projects.md)
//   - 둘 다 켜짐: 견적서를 결재에 올리고, 최종 승인 처리기(onFinalApproved)가 같은 트랜잭션에서 견적을 확정한다.
//   - 결재 꺼짐: 이 모듈이 등록되지 않는다 → 처리기도 없고, 과제 관리 쪽에서 권한자가 직접 확정한다.
// ProjectsModule이 ApprovalsModule을 직접 import하면 결재를 끈 배포에서도 결재 API가 생기므로, 연결은 이 모듈에만 둔다.
// 휴가(LeaveDocumentHandler)와 같은 방식으로 ApprovalHandlerRegistry에 견적서 처리기를 등록한다. (예정)
@Module({
    imports: [ ProjectsModule, ApprovalsModule ],
    providers: [],
})
export class ProjectsApprovalModule {}
