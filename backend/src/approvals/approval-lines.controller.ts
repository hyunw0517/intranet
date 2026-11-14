import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { ApprovalLinesService } from './approval-lines.service';
import { CreateApprovalLineDto, ManageApprovalLineQueryDto, UpdateApprovalLineDto } from './dto/approval-line.dto';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 결재라인 템플릿 - 공용·부서는 결재라인 관리자(서비스에서 판정), 개인은 본인
// 고정 경로(manage)는 ':id'보다 먼저 선언한다.
@Controller('approvals/lines')
export class ApprovalLinesController {

    constructor(
        private readonly approvalLinesService: ApprovalLinesService,
    ){}

    //* 내가 불러올 수 있는 템플릿 (공용 + 내 부서 + 내 개인)
    @Get()
    @Roles(UserRole.USER)
    findUsable( @User() user: Actor ) {
        return this.approvalLinesService.findUsable( user );
    }

    //* 내가 관리할 수 있는 공용·부서 템플릿 (권한 없으면 403)
    @Get('manage')
    @Roles(UserRole.USER)
    findManageable(
        @User() user: Actor,
        @Query() query: ManageApprovalLineQueryDto,
    ) {
        return this.approvalLinesService.findManageable( user, query );
    }

    @Post()
    @Roles(UserRole.USER)
    create(
        @User() user: Actor,
        @Body() body: CreateApprovalLineDto,
    ) {
        return this.approvalLinesService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    update(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateApprovalLineDto,
    ) {
        return this.approvalLinesService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.approvalLinesService.delete( user, id );
    }
}
