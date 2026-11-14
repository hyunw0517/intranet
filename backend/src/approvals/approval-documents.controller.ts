import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { ApprovalDocumentsService } from './approval-documents.service';
import {
    ApprovalDocumentListQueryDto, ApproveDocumentDto, CreateApprovalDocumentDto, RejectDocumentDto, ReplaceApproverDto, UpdateApprovalDocumentDto,
} from './dto/approval-document.dto';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 전자결재 문서 - 열람·처리 권한(기안자·결재자·관리자, 상태)은 서비스에서 문서마다 확인한다.
// 상태 변경은 PATCH :id/<동작> (시설 예약과 같은 형식)
@Controller('approvals')
export class ApprovalDocumentsController {

    constructor(
        private readonly documentsService: ApprovalDocumentsService,
    ){}

    //* 쓸 수 있는 문서 유형 (처리기가 등록된 것)
    @Get('document-types')
    @Roles(UserRole.USER)
    documentTypes() {
        return this.documentsService.documentTypes();
    }

    //* 결재함 (?box=drafts|mine|pending|upcoming|processed|all)
    @Get('documents')
    @Roles(UserRole.USER)
    findList(
        @User() user: Actor,
        @Query() query: ApprovalDocumentListQueryDto,
    ) {
        return this.documentsService.findList( user, query );
    }

    //* 결재함 탭 건수 { pending, upcoming, mine(진행 중만), drafts } - 'documents/:id'보다 먼저 선언
    @Get('documents/counts')
    @Roles(UserRole.USER)
    counts( @User() user: Actor ) {
        return this.documentsService.counts( user );
    }

    @Get('documents/:id')
    @Roles(UserRole.USER)
    findOne(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.findOne( user, id );
    }

    //* 임시저장 생성 (상신은 :id/submit)
    @Post('documents')
    @Roles(UserRole.USER)
    create(
        @User() user: Actor,
        @Body() body: CreateApprovalDocumentDto,
    ) {
        return this.documentsService.create( user, body );
    }

    //* 다시 기안 (반려·회수 문서 → 새 임시저장)
    @Post('documents/:id/copy')
    @Roles(UserRole.USER)
    copy(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.copy( user, id );
    }

    @Patch('documents/:id/submit')
    @Roles(UserRole.USER)
    submit(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.submit( user, id );
    }

    @Patch('documents/:id/cancel')
    @Roles(UserRole.USER)
    cancel(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.cancel( user, id );
    }

    @Patch('documents/:id/approve')
    @Roles(UserRole.USER)
    approve(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: ApproveDocumentDto,
    ) {
        return this.documentsService.approve( user, id, body );
    }

    @Patch('documents/:id/reject')
    @Roles(UserRole.USER)
    reject(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: RejectDocumentDto,
    ) {
        return this.documentsService.reject( user, id, body );
    }

    //* 관리자 결재자 교체 (진행 중 문서의 남은 결재자 한 명) - 병렬 단계는 단계 번호로 한 사람을 정할 수 없어 단계 행 id를 쓴다
    @Patch('documents/:id/steps/:stepId')
    @RequireAdmin(AdminPermission.APPROVAL_LINES)
    replaceApprover(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Param('stepId', ParseIntPipe) stepId: number,
        @Body() body: ReplaceApproverDto,
    ) {
        return this.documentsService.replaceApprover( user, id, stepId, body );
    }

    //* 임시저장 수정
    @Patch('documents/:id')
    @Roles(UserRole.USER)
    update(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateApprovalDocumentDto,
    ) {
        return this.documentsService.update( user, id, body );
    }

    //* 임시저장 삭제
    @Delete('documents/:id')
    @Roles(UserRole.USER)
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.delete( user, id );
    }

    //* 첨부 다운로드 (열람 권한) - 게시글 첨부와 같은 응답 형식
    @Get('documents/:id/files/:fileId')
    @Roles(UserRole.USER)
    async downloadFile(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, originalName, size } = await this.documentsService.openAttachment( user, id, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );

        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
