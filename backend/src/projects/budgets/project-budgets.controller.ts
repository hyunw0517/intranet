import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { CreateProjectExpenseDto, ProjectStatsQueryDto, SaveBudgetCategoryDto, SaveProjectBudgetsDto, UpdateProjectExpenseDto } from './dto/project-budget.dto';
import { ProjectBudgetCategoriesService } from './project-budget-categories.service';
import { ProjectBudgetsService } from './project-budgets.service';
import { ProjectStatsService } from './project-stats.service';

//* 비용 항목 - 조회는 USER, 관리는 과제 관리 관리자 ('projects/:id'보다 먼저 등록한다, projects.module.ts)
@Controller('projects/budget-categories')
export class ProjectBudgetCategoriesController {

    constructor(
        private readonly categoriesService: ProjectBudgetCategoriesService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    findAll() {
        return this.categoriesService.findAll();
    }

    @Post()
    @RequireAdmin(AdminPermission.PROJECTS)
    create( @User() user: ProjectActor, @Body() body: SaveBudgetCategoryDto ) {
        return this.categoriesService.create( user, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.PROJECTS)
    update( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number, @Body() body: SaveBudgetCategoryDto ) {
        return this.categoriesService.update( user, id, body );
    }

    //* 숨기기 (soft delete)
    @Delete(':id')
    @RequireAdmin(AdminPermission.PROJECTS)
    remove( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.categoriesService.remove( user, id );
    }
}

//* 전사 통계 (월별 매출·지출, 거래처별 매출 순위, 항목별 예산 대비 지출) - 과제 관리 관리자 ('projects/:id'보다 먼저 등록한다)
@Controller('projects/stats')
export class ProjectStatsController {

    constructor(
        private readonly statsService: ProjectStatsService,
    ){}

    //* 통계 (?year=2025&projectId=1&clientId=2, 모두 선택 - 없으면 최근 12개월·전체)
    @Get()
    @RequireAdmin(AdminPermission.PROJECTS)
    company( @Query() query: ProjectStatsQueryDto ) {
        return this.statsService.company( query );
    }

    //* 필터 선택지 (연도·프로젝트·거래처)
    @Get('filters')
    @RequireAdmin(AdminPermission.PROJECTS)
    filters() {
        return this.statsService.filters();
    }
}

//* 프로젝트 예산·지출 - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-3장)
@Controller('projects/:projectId/budgets')
export class ProjectBudgetsController {

    constructor(
        private readonly budgetsService: ProjectBudgetsService,
    ){}

    //* 요약 + 항목별 예산 대비 지출 + 협력사별 지급 + 월별 지출 + 지출 목록
    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.budgetsService.findAll( user, projectId );
    }

    //* 항목별 예산 저장 (목록 전체 교체)
    @Put()
    @Roles(UserRole.USER)
    save( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: SaveProjectBudgetsDto ) {
        return this.budgetsService.saveBudgets( user, projectId, body );
    }

    @Post('expenses')
    @Roles(UserRole.USER)
    createExpense( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectExpenseDto ) {
        return this.budgetsService.createExpense( user, projectId, body );
    }

    @Patch('expenses/:expenseId')
    @Roles(UserRole.USER)
    updateExpense(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('expenseId', ParseIntPipe) expenseId: number,
        @Body() body: UpdateProjectExpenseDto,
    ) {
        return this.budgetsService.updateExpense( user, projectId, expenseId, body );
    }

    @Delete('expenses/:expenseId')
    @Roles(UserRole.USER)
    deleteExpense( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('expenseId', ParseIntPipe) expenseId: number ) {
        return this.budgetsService.deleteExpense( user, projectId, expenseId );
    }

    //* 증빙 파일 다운로드 - 매출 세금계산서와 같은 응답 형식
    @Get('expenses/:expenseId/files/:fileId')
    @Roles(UserRole.USER)
    async downloadFile(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('expenseId', ParseIntPipe) expenseId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, originalName, size } = await this.budgetsService.openFile( user, projectId, expenseId, fileId );
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
