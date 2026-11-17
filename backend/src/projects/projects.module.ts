import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProjectClientsController } from './clients/project-clients.controller';
import { ProjectClientsService } from './clients/project-clients.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectNotifier } from './project-notifier';
import { ProjectMembersController, ProjectPartnersController, ProjectsController } from './projects.controller';
import { ProjectPartnersService } from './project-partners.service';
import { ProjectsService } from './projects.service';
import { ProjectTasksController } from './tasks/project-tasks.controller';
import { ProjectTasksService } from './tasks/project-tasks.service';
import { ProjectQuotesController } from './quotes/project-quotes.controller';
import { ProjectQuotesService } from './quotes/project-quotes.service';

//! 과제 관리 (애드온 'projects') - AppModule에서 addonModule('projects', ProjectsModule)로만 등록한다. (docs/design/projects.md)
// 하위 모듈(거래처·견적서·매출·예산)은 옵션으로 나누지 않고 이 애드온 하나로 함께 켜진다. (2026-11-16 사용자 결정)
//   projects/              프로젝트 본체·참여자·협력사(하청)·권한 판단(ProjectAccessService - 하위 기능이 모두 먼저 호출)
//   projects/tasks/        과제 (칸반, 진척도, 마감 임박 배치)
//   projects/clients/      거래처 + 담당자
//   projects/quotes/       견적서 (버전·품목·확정, 결재 연결은 quote-approval.ts → ProjectsApprovalModule)
//   projects/sales/        매출 (예정)
//   projects/budgets/      예산 (예정)
// 핵심(common)의 파일·감사 로그·알림을 직접 쓴다. 결재는 import하지 않는다. → 결재 연결은 ProjectsApprovalModule
@Module({
    imports: [ PrismaModule, CommonModule ],
    // 거래처 컨트롤러를 먼저 둔다 ('projects/clients'를 'projects/:id'가 먼저 잡지 않게)
    controllers: [ ProjectClientsController, ProjectsController, ProjectMembersController, ProjectPartnersController, ProjectTasksController, ProjectQuotesController ],
    providers: [
        ProjectAccessService,
        ProjectNotifier,
        ProjectClientsService,
        ProjectsService,
        ProjectMembersService,
        ProjectPartnersService,
        ProjectTasksService,
        ProjectQuotesService,
    ],
    exports: [ ProjectQuotesService ], // 견적서 결재 처리기·상신(ProjectsApprovalModule)이 쓴다
})
export class ProjectsModule {}
