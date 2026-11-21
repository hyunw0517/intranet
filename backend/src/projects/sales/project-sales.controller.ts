import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { BillProjectSaleDto, CreateProjectSaleDto, CreateSalePaymentDto, UpdateProjectSaleDto } from './dto/project-sale.dto';
import { ProjectSalesService } from './project-sales.service';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';

//* 매출 (청구 건·수금·세금계산서) - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-2장)
@ApiTags('Projects · Sales (매출)')
@Controller('projects/:projectId/sales')
export class ProjectSalesController {

    constructor(
        private readonly salesService: ProjectSalesService,
    ){}

    //* 목록 + 요약 + 확정 견적별 청구 잔액
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '매출 목록', description: '요약(청구 매출·예상 매출·수금) + 확정 견적별 청구 잔액 + 청구 건(수금 기록·세금계산서 포함). 수금 상태(미수·부분·완료)는 수금 합계로 계산한다. 매출 기준일은 청구일. 참여자 누구나.' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.salesService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '청구 건 등록', description: '공급가액 + 과세/면세 + 부가세율 → 부가세·합계는 서버가 계산. 확정 견적 연결은 선택이고, 연결하면 그 견적의 청구 합계(부가세 포함, 취소 제외) ≤ 견적 합계(견적 행을 잠근 뒤 센다). 청구일을 함께 보내면 바로 청구 상태로 만든다. 세금계산서 파일은 첨부로 먼저 올린 뒤 id로 보낸다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 이 프로젝트의 견적이 아님, 확정되지 않은 견적, 견적 금액 초과, 금액이 너무 큼' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트' })
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectSaleDto ) {
        return this.salesService.create( user, projectId, body );
    }

    @Patch(':saleId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '청구 건 수정', description: '금액·견적·과세·부가세율·예정일은 청구 예정일 때만 고친다(청구한 뒤에는 취소 후 다시 등록). 승인번호·첨부는 청구 뒤에도 고칠 수 있다(수정세금계산서는 파일 추가).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 취소된 청구, 청구한 건의 금액 등 변경, 견적 금액 초과' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출' })
    update(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Body() body: UpdateProjectSaleDto,
    ) {
        return this.salesService.update( user, projectId, saleId, body );
    }

    //* 청구 예정만 삭제
    @Delete(':saleId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '청구 예정 삭제 (soft delete)', description: '청구 예정만. 청구한 건은 취소한다.' })
    @ApiBadRequestResponse({ description: '청구 예정이 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출' })
    delete( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('saleId', ParseIntPipe) saleId: number ) {
        return this.salesService.delete( user, projectId, saleId );
    }

    //* 청구 (청구 예정 → 청구)
    @Patch(':saleId/bill')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '청구', description: '청구 예정 → 청구. 청구일 = 매출 기준일 = 세금계산서 발행일.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 청구 예정이 아님' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출' })
    bill(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Body() body: BillProjectSaleDto,
    ) {
        return this.salesService.bill( user, projectId, saleId, body );
    }

    //* 청구 취소 (수금이 없을 때만)
    @Patch(':saleId/cancel')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '청구 취소', description: '청구한 건만, 수금 기록이 없을 때만(수금을 먼저 지운다). "취소됨"으로 남고 매출·청구 합계에서 빠진다.' })
    @ApiBadRequestResponse({ description: '청구한 건이 아님(청구 예정은 삭제), 수금 기록이 있음' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출' })
    cancel( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('saleId', ParseIntPipe) saleId: number ) {
        return this.salesService.cancel( user, projectId, saleId );
    }

    //* 수금 기록
    @Post(':saleId/payments')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '수금 기록', description: '청구한 건에만. 부분 수금 가능(여러 건), 합계 ≤ 청구 금액(청구 행을 잠근 뒤 센다).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 청구한 건이 아님, 수금 합계가 청구 금액을 넘음(메시지에 남은 금액)' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출' })
    addPayment(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Body() body: CreateSalePaymentDto,
    ) {
        return this.salesService.addPayment( user, projectId, saleId, body );
    }

    @Delete(':saleId/payments/:paymentId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '수금 기록 삭제' })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출·수금 기록' })
    deletePayment(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Param('paymentId', ParseIntPipe) paymentId: number,
    ) {
        return this.salesService.deletePayment( user, projectId, saleId, paymentId );
    }

    //* 세금계산서 파일 다운로드 - 게시글·결재 첨부와 같은 응답 형식
    @Get(':saleId/files/:fileId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '세금계산서 파일 다운로드', description: '프로젝트를 볼 수 있는 사람만. 게시글·결재 첨부와 같은 응답 형식(application/octet-stream + attachment).' })
    @ApiProduces('application/octet-stream')
    @ApiOkResponse({ description: '파일 본문', schema: { type: 'string', format: 'binary' } })
    @ApiForbiddenResponse({ description: '참여한 프로젝트가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않는 프로젝트·매출·파일' })
    async downloadFile(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const { stream, originalName, size } = await this.salesService.openFile( user, projectId, saleId, fileId );
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
