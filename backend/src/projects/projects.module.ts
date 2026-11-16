import { Module } from '@nestjs/common';
import { CommonModule } from 'src/common/common.module';
import { PrismaModule } from 'src/prisma/prisma.module';

//! 과제 관리 (애드온 'projects') - AppModule에서 addonModule('projects', ProjectsModule)로만 등록한다. (docs/design/projects.md)
// 하위 모듈(거래처·견적서·매출·예산)은 옵션으로 나누지 않고 이 애드온 하나로 함께 켜진다. (2026-11-16 사용자 결정)
// 코드는 이 폴더 안에서 하위 기능별로 나눈다. (예정)
//   projects/              프로젝트 본체·참여자 (참여자만 열람, 금액은 책임자·과제 관리 관리자·금액 열람 허용 참여자만)
//   projects/tasks/        과제 (칸반, 진척도 자동 계산)
//   projects/clients/      거래처 (프로젝트·견적·매출이 참조)
//   projects/quotes/       견적서
//   projects/sales/        매출
//   projects/budgets/      예산
// 핵심(common)의 파일·감사 로그·알림을 직접 쓴다. 결재는 import하지 않는다. → 결재 연결은 ProjectsApprovalModule
@Module({
    imports: [ PrismaModule, CommonModule ],
    controllers: [],
    providers: [],
    exports: [], // 견적서 결재 처리기(ProjectsApprovalModule)가 쓸 견적 서비스를 내보낼 예정
})
export class ProjectsModule {}
