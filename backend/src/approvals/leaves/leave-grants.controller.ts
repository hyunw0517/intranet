import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { AdjustLeaveGrantDto, LeaveGrantListQueryDto } from './dto/leave.dto';
import { LeaveGrantsService } from './leave-grants.service';

//* 관리자 연차 관리 (docs/design/leave_calculate_manual.md 4~5장)
@Controller('approvals/leaves/grants')
export class LeaveGrantsController {

    constructor(
        private readonly grantsService: LeaveGrantsService,
    ){}

    //* 연차 현황 (?year=&search=&page=&take=)
    @Get()
    @RequireAdmin(AdminPermission.LEAVES)
    findList( @Query() query: LeaveGrantListQueryDto ) {
        return this.grantsService.findList( query );
    }

    //* 지금 재계산 (오늘 기준 올해 행, 12월이면 다음 해 행도 - 월 배치와 같은 서비스)
    @Post('recalculate')
    @RequireAdmin(AdminPermission.LEAVES)
    recalculate( @User() user: Pick<Users, 'id'> ) {
        return this.grantsService.recalculate( user.id );
    }

    //* 조정값·사유 저장 (body.year: 비우면 올해, 다음 해는 12월에 행이 생긴 뒤)
    @Patch(':userId')
    @RequireAdmin(AdminPermission.LEAVES)
    adjust(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body: AdjustLeaveGrantDto,
    ) {
        return this.grantsService.adjust( userId, body );
    }
}
