import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { CreateProjectQuoteDto, UpdateProjectQuoteDto } from './dto/project-quote.dto';
import { ProjectQuotesService } from './project-quotes.service';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 견적서 - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-1장)
// 결재 상신(POST …/versions/:versionId/submit)은 결재가 켜졌을 때만 있는 ProjectsApprovalModule의 컨트롤러에 있다.
@ApiTags('Projects · Quotes (견적서)')
@Controller('projects/:projectId/quotes')
export class ProjectQuotesController {

    constructor(
        private readonly quotesService: ProjectQuotesService,
    ){}

    //* 목록 + 계약 금액(확정 버전 합계) + 결재 사용 여부
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '견적서 목록', description: '견적마다 버전과 표시 상태(작성 중·결재 중·확정·반려·취소됨), 계약 금액(확정 견적 합계, 조회 시 계산), 결재 사용 여부(전자결재 애드온이 켜졌는지). 참여자 누구나, 금액은 문자열.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.quotesService.findAll( user, projectId );
    }

    @Get(':quoteId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '견적서 상세', description: '모든 버전과 품목, 발주처 스냅샷(작성 당시 회사·담당자).' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서' })
    findOne( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.findOne( user, projectId, quoteId );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '견적서 작성', description: '견적번호는 연도별 일련번호(Q-2026-0001, 회사 전체, 채번 행 잠금). v1이 작성 중으로 만들어진다. 품목 금액 = 수량 × 단가, 부가세 = 공급가액 합 × 부가세율 원 미만 버림(면세 0). 발주처 정보는 작성 당시 값으로 스냅샷한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 프로젝트에 발주처가 없음, 발주처의 담당자가 아닌 수신자, 유효기간이 견적일보다 앞섬' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectQuoteDto ) {
        return this.quotesService.create( user, projectId, body );
    }

    @Delete(':quoteId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '견적서 삭제 (soft delete)', description: '확정·결재 중인 버전이 없을 때만.' })
    @ApiBadRequestResponse({ description: '확정된 버전이 있음(확정 취소 후 삭제), 결재 중' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서' })
    delete( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.delete( user, projectId, quoteId );
    }

    //* 새 버전 (최신 버전 복사)
    @Post(':quoteId/versions')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '새 버전', description: '최신 버전을 복사해 v2, v3…을 만든다(견적일은 오늘, 유효기간은 비움). 이전 버전은 읽기 전용. 확정된 견적은 새 버전을 만들 수 없다(변경은 새 견적).' })
    @ApiBadRequestResponse({ description: '확정된 견적, 결재 중인 견적' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서' })
    createVersion( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.createVersion( user, projectId, quoteId );
    }

    //* 작성 중 버전 저장
    @Patch(':quoteId/versions/:versionId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '작성 중 버전 저장', description: '최신 버전이 작성 중(반려 포함)일 때만. 품목은 보내면 전체 교체.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 최신 버전이 아님, 작성 중이 아님(결재 중·확정), 발주처 담당자가 아닌 수신자, 유효기간이 견적일보다 앞섬' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서·버전' })
    updateVersion(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
        @Body() body: UpdateProjectQuoteDto,
    ) {
        return this.quotesService.updateVersion( user, projectId, quoteId, versionId, body );
    }

    @Delete(':quoteId/versions/:versionId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '작성 중 버전 삭제', description: '작성 중인 최신 버전만. 첫 버전은 지울 수 없다(견적을 삭제).' })
    @ApiBadRequestResponse({ description: '첫 버전, 최신 버전이 아님, 작성 중이 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서·버전' })
    deleteVersion(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.quotesService.deleteVersion( user, projectId, quoteId, versionId );
    }

    //* 직접 확정 (결재가 꺼진 배포에서만 - 켜져 있으면 400)
    @Patch(':quoteId/versions/:versionId/confirm')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '직접 확정', description: '전자결재가 꺼진 배포에서만. 작성 중인 최신 버전을 확정한다(품목 1개 이상). 확정 견적은 여러 개일 수 있고 합계가 계약 금액이 된다. 결재가 켜져 있으면 POST …/submit으로 결재를 올린다.' })
    @ApiBadRequestResponse({ description: '전자결재가 켜져 있음, 최신 버전이 아님, 작성 중이 아님, 품목 없음' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서·버전' })
    confirm(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.quotesService.confirm( user, projectId, quoteId, versionId );
    }

    //* 확정 취소 (취소됨으로 남김)
    @Patch(':quoteId/versions/:versionId/cancel')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '확정 취소', description: '작성 중으로 돌아가지 않고 "취소됨"으로 남긴다(기록 보존). 결재로 확정된 것도 취소할 수 있다. 취소되지 않은 청구(예정 포함)가 연결된 견적은 취소할 수 없다.' })
    @ApiBadRequestResponse({ description: '확정된 버전이 아님, 매출이 연결됨' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서·버전' })
    cancelConfirm(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.quotesService.cancelConfirm( user, projectId, quoteId, versionId );
    }
}
