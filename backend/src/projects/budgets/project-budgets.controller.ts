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
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

//* 비용 항목 - 조회는 USER, 관리는 과제 관리 관리자 ('projects/:id'보다 먼저 등록한다, projects.module.ts)
@ApiTags('Projects · Budget Categories (비용 항목)')
@Controller('projects/budget-categories')
export class ProjectBudgetCategoriesController {

    constructor(
        private readonly categoriesService: ProjectBudgetCategoriesService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '비용 항목 목록', description: '전사 공통. 프로젝트 예산·지출에서 고른다. 숨긴 항목은 나오지 않는다.' })
    findAll() {
        return this.categoriesService.findAll();
    }

    @Post()
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 비용 항목 생성' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiConflictResponse({ description: '같은 이름의 비용 항목이 있음' })
    create( @User() user: ProjectActor, @Body() body: SaveBudgetCategoryDto ) {
        return this.categoriesService.create( user, body );
    }

    @Patch(':id')
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 비용 항목 수정' })
    @ApiBadRequestResponse({ description: '입력 검증 실패' })
    @ApiNotFoundResponse({ description: '존재하지 않는 비용 항목' })
    @ApiConflictResponse({ description: '같은 이름의 비용 항목이 있음' })
    update( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number, @Body() body: SaveBudgetCategoryDto ) {
        return this.categoriesService.update( user, id, body );
    }

    //* 숨기기 (soft delete)
    @Delete(':id')
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 비용 항목 숨기기 (soft delete)', description: '새 예산·지출에서는 고를 수 없고, 이미 쓴 기록에는 이름이 그대로 남는다.' })
    @ApiNotFoundResponse({ description: '존재하지 않는 비용 항목' })
    remove( @User() user: ProjectActor, @Param('id', ParseIntPipe) id: number ) {
        return this.categoriesService.remove( user, id );
    }
}

//* 전사 통계 (월별 매출·지출, 거래처별 매출 순위, 항목별 예산 대비 지출) - 과제 관리 관리자 ('projects/:id'보다 먼저 등록한다)
@ApiTags('Projects · Stats (전사 통계)')
@Controller('projects/stats')
export class ProjectStatsController {

    constructor(
        private readonly statsService: ProjectStatsService,
    ){}

    //* 통계 (?year=2025&projectId=1&clientId=2, 모두 선택 - 없으면 최근 12개월·전체)
    @Get()
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 전사 통계', description: '월별 매출(청구 건 합계, 부가세 포함, 청구일 기준)·월별 지출(공급가액 기준)·거래처별 매출 순위·항목별 예산 대비 지출. year·projectId·clientId는 선택이고 없으면 최근 12개월·전체. 항목별 예산 대비 지출은 예산에 연도가 없어 기간과 관계없는 누적.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    company( @Query() query: ProjectStatsQueryDto ) {
        return this.statsService.company( query );
    }

    //* 필터 선택지 (연도·프로젝트·거래처)
    @Get('filters')
    @RequireAdmin(AdminPermission.PROJECTS)
    @ApiOperation({ summary: '(관리자) 통계 필터 선택지', description: '연도·프로젝트·거래처 목록.' })
    filters() {
        return this.statsService.filters();
    }
}

//* 프로젝트 예산·지출 - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-3장)
@ApiTags('Projects · Budgets (예산·지출)')
@Controller('projects/:projectId/budgets')
export class ProjectBudgetsController {

    constructor(
        private readonly budgetsService: ProjectBudgetsService,
    ){}

    //* 요약 + 항목별 예산 대비 지출 + 협력사별 지급 + 월별 지출 + 지출 목록
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '예산·지출 조회', description: '요약 + 항목별 예산 대비 지출(공급가액 기준) + 협력사별 계약 금액·지급액·남은 금액 + 월별 지출(최근 12개월) + 지출 목록(증빙 파일 포함). 예산이 없는 항목에 쓴 금액도 초과로 본다. 참여자 누구나.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.budgetsService.findAll( user, projectId );
    }

    //* 항목별 예산 저장 (목록 전체 교체)
    @Put()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '항목별 예산 저장', description: '프로젝트 × 비용 항목당 금액 하나, 목록 전체를 보내 교체한다. 동시 저장은 프로젝트 행을 잠가 차례로 처리한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 같은 비용 항목이 두 번, 고를 수 없는(숨긴) 비용 항목' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    save( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: SaveProjectBudgetsDto ) {
        return this.budgetsService.saveBudgets( user, projectId, body );
    }

    @Post('expenses')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '지출 등록', description: '직접 입력(결재 연동 없음): 지출일·항목·내용·공급가액 + 과세/면세 + 부가세율·메모, 협력사(선택)·증빙 파일(선택). 예산을 넘어도 저장하고 응답에 경고를 담는다(이미 쓴 돈을 기록하는 용도).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 고를 수 없는 비용 항목, 이 프로젝트의 협력사가 아님, 금액이 너무 큼' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    createExpense( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectExpenseDto ) {
        return this.budgetsService.createExpense( user, projectId, body );
    }

    @Patch('expenses/:expenseId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '지출 수정', description: '보낸 항목만 바꾼다. 빠진 협력사·숨긴 항목을 이미 쓴 지출은 그대로 두고, 새로 연결할 때만 활성 여부를 검사한다. 예산 초과면 경고를 담는다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 고를 수 없는 비용 항목, 이 프로젝트의 협력사가 아님, 금액이 너무 큼' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·지출' })
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
    @ApiOperation({ summary: '지출 삭제 (soft delete)', description: '증빙 파일도 함께 soft delete한다.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·지출' })
    deleteExpense( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('expenseId', ParseIntPipe) expenseId: number ) {
        return this.budgetsService.deleteExpense( user, projectId, expenseId );
    }

    //* 증빙 파일 다운로드 - 매출 세금계산서와 같은 응답 형식
    @Get('expenses/:expenseId/files/:fileId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '지출 증빙 파일 다운로드', description: '프로젝트를 볼 수 있는 사람만. 매출 세금계산서와 같은 응답 형식.' })
    @ApiProduces('application/octet-stream')
    @ApiOkResponse({ description: '파일 본문', schema: { type: 'string', format: 'binary' } })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·지출·파일' })
    async downloadFile(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('expenseId', ParseIntPipe) expenseId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, originalName, size } = await this.budgetsService.openFile( user, projectId, expenseId, fileId );
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
