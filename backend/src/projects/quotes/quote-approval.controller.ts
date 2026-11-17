import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { QuoteApprovalService, SubmitQuoteDto } from './quote-approval';

//* POST /projects/:projectId/quotes/:quoteId/versions/:versionId/submit - 참여자 누구나 (결재가 켜졌을 때만 있는 API)
@Controller('projects/:projectId/quotes')
export class QuoteApprovalController {

    constructor(
        private readonly quoteApproval: QuoteApprovalService,
    ){}

    @Post(':quoteId/versions/:versionId/submit')
    @Roles(UserRole.USER)
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
