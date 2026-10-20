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

@Module({
  imports: [PrismaModule],
  controllers: [
    OrganizationController,
    DepartmentsController,
    PositionsController,
    JobTitlesController,
  ],
  providers: [
    OrganizationService,
    DepartmentsService,
    PositionsService,
    JobTitlesService,
  ],
})
export class OrganizationModule {}
