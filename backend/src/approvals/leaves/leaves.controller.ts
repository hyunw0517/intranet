import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { CreateLeaveDto, LeaveCalendarQueryDto, LeaveYearQueryDto, UpdateLeaveDto } from './dto/leave.dto';
import { LeaveRequestsService } from './leave-requests.service';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 휴가 신청 (결재의 옵션 'leaves')
// 상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API(/approvals/documents/...)를 그대로 쓴다.
@Controller('approvals/leaves')
export class LeavesController {

    constructor(
        private readonly leavesService: LeaveRequestsService,
    ){}

    //* 내 연차 현황 { grantedDays, usedDays, inProgressDays, remainingDays, ... }
    @Get('me')
    @Roles(UserRole.USER)
    mySummary(
        @User() user: Actor,
        @Query() query: LeaveYearQueryDto,
    ) {
        return this.leavesService.mySummary( user, query.year );
    }

    //* 캘린더 휴가자 (?start=&end= 게시판 캘린더와 같은 형식) → [{ date, count, people: [{ name, departmentName, positionName, unit, startTime, endTime, ... }] }]
    // 전 직원, 최종 승인된 휴가만, 유형은 내보내지 않는다.
    @Get('calendar')
    @Roles(UserRole.USER)
    calendar( @Query() query: LeaveCalendarQueryDto ) {
        return this.leavesService.calendar( query.start, query.end );
    }

    //* 내 휴가 신청 목록 (그 연도)
    @Get()
    @Roles(UserRole.USER)
    findMine(
        @User() user: Actor,
        @Query() query: LeaveYearQueryDto,
    ) {
        return this.leavesService.findMine( user, query.year );
    }

    //* 휴가 신청 임시저장 → 휴가 정보 (documentId로 상신)
    @Post()
    @Roles(UserRole.USER)
    create(
        @User() user: Actor,
        @Body() body: CreateLeaveDto,
    ) {
        return this.leavesService.create( user, body );
    }

    //* 결재 문서에 딸린 휴가 정보 (문서 열람 권한과 같다)
    @Get('documents/:documentId')
    @Roles(UserRole.USER)
    findByDocument(
        @User() user: Actor,
        @Param('documentId', ParseIntPipe) documentId: number,
    ) {
        return this.leavesService.findByDocument( user, documentId );
    }

    //* 임시저장 수정 (기안자, DRAFT만)
    @Patch('documents/:documentId')
    @Roles(UserRole.USER)
    update(
        @User() user: Actor,
        @Param('documentId', ParseIntPipe) documentId: number,
        @Body() body: UpdateLeaveDto,
    ) {
        return this.leavesService.update( user, documentId, body );
    }
}
