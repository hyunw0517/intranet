import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { ApprovalDocumentsService } from './approval-documents.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
    ApprovalDocumentListQueryDto, ApproveDocumentDto, CreateApprovalDocumentDto, RejectDocumentDto, ReplaceApproverDto, UpdateApprovalDocumentDto,
} from './dto/approval-document.dto';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 전자결재 문서 - 열람·처리 권한(기안자·결재자·관리자, 상태)은 서비스에서 문서마다 확인한다.
// 상태 변경은 PATCH :id/<동작> (시설 예약과 같은 형식)
@ApiTags('Approvals (전자결재)')
@Controller('approvals')
export class ApprovalDocumentsController {

    constructor(
        private readonly documentsService: ApprovalDocumentsService,
    ){}

    //* 쓸 수 있는 문서 유형 (처리기가 등록된 것)
    @Get('document-types')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '쓸 수 있는 문서 유형', description: '처리기가 등록된 유형만 나온다(예: 휴가 옵션이 꺼져 있으면 휴가 유형이 없다).' })
    documentTypes() {
        return this.documentsService.documentTypes();
    }

    //* 결재함 (?box=drafts|mine|pending|upcoming|processed|all)
    @Get('documents')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재함', description: 'box: drafts 임시저장(최근 수정순) / mine 기안함(DRAFT 제외, 상신 최신순) / pending 결재 대기(내 차례, 상신 오래된 순) / upcoming 결재 예정(아직 내 차례가 아님) / processed 결재 완료(내가 처리, 처리 최신순) / all 전체(결재라인 관리 권한이 있는 관리자, DRAFT 제외). status는 mine·processed·all에서 문서 상태 필터. 페이지.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    @ApiForbiddenResponse({ description: 'box=all인데 결재라인 관리 권한이 있는 관리자가 아님' })
    findList(
        @User() user: Actor,
        @Query() query: ApprovalDocumentListQueryDto,
    ) {
        return this.documentsService.findList( user, query );
    }

    //* 결재함 탭 건수 { pending, upcoming, mine(진행 중만), drafts } - 'documents/:id'보다 먼저 선언
    @Get('documents/counts')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재함 탭 건수', description: '`{ pending, upcoming, mine, drafts }`. 기안함(mine)은 결재 요청·결재 중인 내 문서만 센다.' })
    counts( @User() user: Actor ) {
        return this.documentsService.counts( user );
    }

    @Get('documents/:id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재 문서 상세', description: '열람: 기안자 + 결재라인 전원(아직 차례가 아닌 사람 포함) + 관리자(조회만). 임시저장은 기안자만. 결재라인은 상신 당시 스냅샷(이름·부서·직급·직책). 첨부·이력 포함.' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    findOne(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.findOne( user, id );
    }

    //* 임시저장 생성 (상신은 :id/submit)
    @Post('documents')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '임시저장 생성', description: '상신은 PATCH :id/submit으로 따로 한다(화면의 상신 버튼은 저장 후 상신을 연달아 호출). 결재라인은 비워 둘 수 있다. 본문은 Tiptap HTML을 서버가 정제한다(본문 이미지는 쓰지 않음). 휴가처럼 업무 데이터가 있는 유형은 그 업무 API(POST /approvals/leaves)로 만든다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 업무 화면에서 신청해야 하는 유형, 결재라인 규칙 위반(빈 단계, 결재자 중복·본인 포함 등)' })
    create(
        @User() user: Actor,
        @Body() body: CreateApprovalDocumentDto,
    ) {
        return this.documentsService.create( user, body );
    }

    //* 다시 기안 (반려·회수 문서 → 새 임시저장)
    @Post('documents/:id/copy')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '다시 기안', description: '반려·회수된 문서를 고치지 않고 제목·본문·첨부·결재라인을 새 임시저장으로 복사한다. 원래 문서는 그대로 남는다(반려 사유 보존). 기안자만.' })
    @ApiBadRequestResponse({ description: '업무 화면에서 다시 신청해야 하는 유형' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '반려·회수된 문서가 아님' })
    copy(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.copy( user, id );
    }

    @Patch('documents/:id/submit')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '상신', description: '임시저장 → 결재 요청. 이때 결재라인을 검사하고(1~10명, 본인 제외, 중복 불가, 재직 중인 승인 회원) 스냅샷을 저장한다. 문서 유형의 처리기가 업무 규칙을 같은 트랜잭션에서 검사한다(예: 휴가 겹침·하루 합계·잔여 연차). 첫 단계 결재자에게 알린다. 상신 후에는 본문·첨부를 고칠 수 없다.' })
    @ApiBadRequestResponse({ description: '결재라인 규칙 위반, 결재자로 지정할 수 없는 회원, 업무 규칙 위반(메시지에 이유)' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '임시저장 상태가 아님, 처리 중 상태가 바뀜' })
    submit(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.submit( user, id );
    }

    @Patch('documents/:id/cancel')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '회수', description: '첫 승인 전(결재 요청 상태)까지 기안자만. 한 명이라도 승인했으면 회수할 수 없고 결재자가 반려해야 한다.' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '승인이 진행된 문서, 결재 요청 상태가 아님, 처리 중 상태가 바뀜' })
    cancel(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.cancel( user, id );
    }

    @Patch('documents/:id/approve')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '승인', description: '내 차례(PENDING) 단계만. 의견은 선택. 한 단계에 여러 명이면 모두 승인해야 다음 단계가 열린다(다음 단계 결재자에게 알림). 마지막 승인이면 문서 유형의 처리기가 같은 트랜잭션에서 업무를 반영하고(예: 연차 차감 검사) 기안자에게 알린다. 동시 처리(두 탭·더블 클릭)는 조건부 UPDATE로 막아 409.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 최종 승인 시 업무 규칙 위반' })
    @ApiForbiddenResponse({ description: '내 차례가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '결재 진행 중인 문서가 아님, 이미 처리한 결재, 처리 중 상태가 바뀜' })
    approve(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: ApproveDocumentDto,
    ) {
        return this.documentsService.approve( user, id, body );
    }

    @Patch('documents/:id/reject')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '반려', description: '내 차례 단계만, 의견 필수. 한 명이라도 반려하면 문서가 반려되고, 같은 단계에서 아직 처리하지 않은 사람은 결재 대기함에서 빠진다. 기안자에게 알린다.' })
    @ApiBadRequestResponse({ description: '반려 의견 없음' })
    @ApiForbiddenResponse({ description: '내 차례가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '결재 진행 중인 문서가 아님, 이미 처리한 결재, 처리 중 상태가 바뀜' })
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
    @ApiOperation({ summary: '(관리자) 결재자 교체', description: '결재자 부재 시 진행 중 문서의 남은(대기·예정) 결재자 한 명을 바꾼다. 병렬 단계는 단계 번호로 한 사람을 정할 수 없어 단계 행 id(stepId)를 쓴다. 새 스냅샷·이력·감사 로그를 남기고, 새 결재자가 지금 차례면 알린다.' })
    @ApiBadRequestResponse({ description: '지금과 같은 결재자, 기안자 본인·같은 문서의 다른 결재자와 중복, 결재자로 지정할 수 없는 회원' })
    @ApiNotFoundResponse({ description: '존재하지 않는 문서·결재 단계' })
    @ApiConflictResponse({ description: '진행 중인 문서가 아님, 이미 처리된 결재자, 처리 중 상태가 바뀜' })
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
    @ApiOperation({ summary: '임시저장 수정', description: '기안자, 임시저장 상태만. 보낸 항목만 바꾸고 steps·attachmentIds는 보내면 전체 교체. 휴가처럼 업무 데이터가 있는 유형은 그 업무 API로 고친다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 업무 화면에서 수정해야 하는 유형, 결재라인 규칙 위반' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '임시저장 상태가 아님' })
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
    @ApiOperation({ summary: '임시저장 삭제 (soft delete)', description: '기안자, 임시저장 상태만. 첨부도 함께 soft delete한다.' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서' })
    @ApiConflictResponse({ description: '임시저장 상태가 아님' })
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.documentsService.delete( user, id );
    }

    //* 첨부 다운로드 (열람 권한) - 게시글 첨부와 같은 응답 형식
    @Get('documents/:id/files/:fileId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '첨부 다운로드', description: '문서 열람 권한으로 확인한 뒤 내려준다. 게시글 첨부와 같은 응답 형식(application/octet-stream + attachment, 한글 파일명 filename*). Bearer 헤더를 붙인 fetch로 받는다.' })
    @ApiProduces('application/octet-stream')
    @ApiOkResponse({ description: '파일 본문', schema: { type: 'string', format: 'binary' } })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서, 이 문서의 첨부가 아닌 파일' })
    async downloadFile(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, originalName, size } = await this.documentsService.openAttachment( user, id, fileId );

        res.setHeader( 'X-Content-Type-Options', 'nosniff' );

        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
