import { Module } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { PositionsService } from './positions.service';
import { PositionsController } from './positions.controller';
import { JobTitlesService } from './job-titles.service';
import { JobTitlesController } from './job-titles.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CommonModule } from 'src/common/common.module';
import { OrgChartController } from './org-chart.controller';
import { OrgChartService } from './org-chart.service';

@Module({
  imports: [
    PrismaModule,
    CommonModule, // 감사 로그 (AuditService), 프로필 사진 주소 (FilesService)
  ],
  exports: [OrganizationService],
  controllers: [
    OrganizationController,
    DepartmentsController,
    PositionsController,
    JobTitlesController,
    OrgChartController,
  ],
  providers: [
    OrganizationService,
    DepartmentsService,
    PositionsService,
    JobTitlesService,
    OrgChartService,
  ],
})
export class OrganizationModule {}
