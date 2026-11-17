import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { CreateProjectQuoteDto, UpdateProjectQuoteDto } from './dto/project-quote.dto';
import { ProjectQuotesService } from './project-quotes.service';

//* 견적서 - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-1장)
// 결재 상신(POST …/versions/:versionId/submit)은 결재가 켜졌을 때만 있는 ProjectsApprovalModule의 컨트롤러에 있다.
@Controller('projects/:projectId/quotes')
export class ProjectQuotesController {

    constructor(
        private readonly quotesService: ProjectQuotesService,
    ){}

    //* 목록 + 계약 금액(확정 버전 합계) + 결재 사용 여부
    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.quotesService.findAll( user, projectId );
    }

    @Get(':quoteId')
    @Roles(UserRole.USER)
    findOne( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.findOne( user, projectId, quoteId );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectQuoteDto ) {
        return this.quotesService.create( user, projectId, body );
    }

    @Delete(':quoteId')
    @Roles(UserRole.USER)
    delete( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.delete( user, projectId, quoteId );
    }

    //* 새 버전 (최신 버전 복사)
    @Post(':quoteId/versions')
    @Roles(UserRole.USER)
    createVersion( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('quoteId', ParseIntPipe) quoteId: number ) {
        return this.quotesService.createVersion( user, projectId, quoteId );
    }

    //* 작성 중 버전 저장
    @Patch(':quoteId/versions/:versionId')
    @Roles(UserRole.USER)
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
    cancelConfirm(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
    ) {
        return this.quotesService.cancelConfirm( user, projectId, quoteId, versionId );
    }
}
