import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ApprovalsModule } from '../approvals.module';
import { LeaveDocumentHandler } from './leave-document.handler';
import { LeaveGrantsController } from './leave-grants.controller';
import { LeaveGrantsService } from './leave-grants.service';
import { LeaveRequestsService } from './leave-requests.service';
import { LeavesController } from './leaves.controller';

//! 휴가 (결재의 옵션 'leaves') - AppModule에서 addonModule('leaves', LeavesModule)로만 등록한다.
// 결재가 켜져 있을 때만 켤 수 있다(ADDONS 검사). 결재 → 휴가 방향 import는 없고, 휴가가 결재의 처리기 등록 지점에 자기를 등록한다.
@Module({
    imports: [ PrismaModule, CommonModule, ApprovalsModule ],
    // grants 컨트롤러를 먼저 둔다 (approvals/leaves/grants 경로가 다른 경로와 섞이지 않게)
    controllers: [ LeaveGrantsController, LeavesController ],
    providers: [ LeaveRequestsService, LeaveGrantsService, LeaveDocumentHandler ],
})
export class LeavesModule {}
