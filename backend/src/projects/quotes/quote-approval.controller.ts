import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { QuoteApprovalService, SubmitQuoteDto } from './quote-approval';
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 견적서 결재 상신 - 참여자 누구나 (결재가 켜졌을 때만 있는 API)
@ApiTags('Projects · Quotes (견적서)')
@Controller('projects/:projectId/quotes')
export class QuoteApprovalController {

    constructor(
        private readonly quoteApproval: QuoteApprovalService,
    ){}

    @Post(':quoteId/versions/:versionId/submit')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '견적서 결재 상신', description: '과제 관리와 전자결재 애드온이 둘 다 켜졌을 때만 있는 API. 결재라인만 받고 제목·본문은 서버가 견적(발주처·품목표·합계)으로 만든다. 최종 승인되면 그 버전이 같은 트랜잭션에서 확정된다. 반려되면 견적 화면에서 고쳐 다시 상신한다(결재함의 다시 기안은 쓰지 않음).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 작성 중이 아님, 최신 버전이 아님, 품목 없음, 결재라인 규칙 위반' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·견적서·버전' })
    @ApiConflictResponse({ description: '다른 사람이 먼저 상신했거나 그 사이 견적이 바뀜' })
    submit(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('quoteId', ParseIntPipe) quoteId: number,
        @Param('versionId', ParseIntPipe) versionId: number,
        @Body() body: SubmitQuoteDto,
    ) {
        return this.quoteApproval.submit( user, projectId, quoteId, versionId, body );
    }
}
