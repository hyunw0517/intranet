import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole } from 'src/generated/prisma/client';
import type { ProjectActor } from '../project-access.service';
import { BillProjectSaleDto, CreateProjectSaleDto, CreateSalePaymentDto, UpdateProjectSaleDto } from './dto/project-sale.dto';
import { ProjectSalesService } from './project-sales.service';

//* 매출 (청구 건·수금·세금계산서) - 참여자 누구나 (서비스에서 프로젝트 권한 확인, docs/design/projects.md 5-2장)
@Controller('projects/:projectId/sales')
export class ProjectSalesController {

    constructor(
        private readonly salesService: ProjectSalesService,
    ){}

    //* 목록 + 요약 + 확정 견적별 청구 잔액
    @Get()
    @Roles(UserRole.USER)
    findAll( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number ) {
        return this.salesService.findAll( user, projectId );
    }

    @Post()
    @Roles(UserRole.USER)
    create( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Body() body: CreateProjectSaleDto ) {
        return this.salesService.create( user, projectId, body );
    }

    @Patch(':saleId')
    @Roles(UserRole.USER)
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
    delete( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('saleId', ParseIntPipe) saleId: number ) {
        return this.salesService.delete( user, projectId, saleId );
    }

    //* 청구 (청구 예정 → 청구)
    @Patch(':saleId/bill')
    @Roles(UserRole.USER)
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
    cancel( @User() user: ProjectActor, @Param('projectId', ParseIntPipe) projectId: number, @Param('saleId', ParseIntPipe) saleId: number ) {
        return this.salesService.cancel( user, projectId, saleId );
    }

    //* 수금 기록
    @Post(':saleId/payments')
    @Roles(UserRole.USER)
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
    async downloadFile(
        @User() user: ProjectActor,
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('saleId', ParseIntPipe) saleId: number,
        @Param('fileId', ParseIntPipe) fileId: number,
        @Res({ passthrough: true }) res: Response,
    ) {
        const { stream, originalName, size } = await this.salesService.openFile( user, projectId, saleId, fileId );
        res.setHeader( 'X-Content-Type-Options', 'nosniff' );
        return new StreamableFile( stream, {
            type: 'application/octet-stream',
            length: size,
            disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent( originalName )}`,
        });
    }
}
