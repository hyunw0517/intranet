import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { CreateLeaveDto, LeaveCalendarQueryDto, LeaveYearQueryDto, UpdateLeaveDto } from './dto/leave.dto';
import { LeaveRequestsService } from './leave-requests.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 휴가 신청 (결재의 옵션 'leaves')
// 상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API(/approvals/documents/...)를 그대로 쓴다.
@ApiTags('Approvals · Leaves (휴가)')
@Controller('approvals/leaves')
export class LeavesController {

    constructor(
        private readonly leavesService: LeaveRequestsService,
    ){}

    //* 내 연차 현황 { grantedDays, usedDays, inProgressDays, remainingDays, ... }
    @Get('me')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 연차 현황', description: '그 연도의 부여(계산값 + 조정값)·사용·결재 진행 중·잔여 일수. 잔여는 진행 중인 신청까지 뺀 값이다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
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
    @ApiOperation({ summary: '캘린더 휴가자', description: '날짜별 `{ date, count, people }`. 전 직원이 보고, 최종 승인된 휴가만, 휴가 유형은 내보내지 않는다. 기간 형식은 게시판 캘린더 일정 조회와 같다. 캘린더 게시판의 "휴가자 표시" 옵션이 켜져 있을 때 화면이 게시판 일정과 합쳐 그린다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, 종료가 시작보다 늦지 않음, 최대 조회 기간 초과' })
    calendar( @Query() query: LeaveCalendarQueryDto ) {
        return this.leavesService.calendar( query.start, query.end );
    }

    //* 내 휴가 신청 목록 (그 연도)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 휴가 신청 목록', description: '그 연도. 병가·공가 포함, 임시저장·반려·회수도 상태와 함께 나온다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findMine(
        @User() user: Actor,
        @Query() query: LeaveYearQueryDto,
    ) {
        return this.leavesService.findMine( user, query.year );
    }

    //* 휴가 신청 임시저장 → 휴가 정보 (documentId로 상신)
    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '휴가 신청 임시저장', description: '결재 문서(DRAFT) + 휴가 정보를 같은 트랜잭션에서 만든다. 제목은 서버가 유형·기간으로 만든다. 상신·회수·승인·반려·삭제·다시 기안은 결재 문서 API를 그대로 쓴다(응답의 documentId). 종일은 달력 일수(주말·공휴일을 빼지 않으므로 쉬는 날은 나눠 신청), 반차·반반차는 시작 시각만 받고(30분 단위) 종료는 서버가 채운다. 겹침·하루 합계 1일·잔여 연차는 상신·최종 승인 때 검사한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 기간 규칙 위반(종일인데 시각 지정, 종료일이 시작일보다 빠름, 연도를 걸침, 반차·반반차인데 여러 날 또는 시작 시각 없음, 30분 단위가 아님, 그날 24:00을 넘김), 결재라인 규칙 위반' })
    create(
        @User() user: Actor,
        @Body() body: CreateLeaveDto,
    ) {
        return this.leavesService.create( user, body );
    }

    //* 결재 문서에 딸린 휴가 정보 (문서 열람 권한과 같다)
    @Get('documents/:documentId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재 문서의 휴가 정보', description: '문서 열람 권한과 같다.' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서, 휴가 신청이 없는 문서' })
    findByDocument(
        @User() user: Actor,
        @Param('documentId', ParseIntPipe) documentId: number,
    ) {
        return this.leavesService.findByDocument( user, documentId );
    }

    //* 임시저장 수정 (기안자, DRAFT만)
    @Patch('documents/:documentId')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '휴가 신청 임시저장 수정', description: '기안자, 임시저장 상태만. 보낸 항목만 바꾸고, 휴가 항목은 보낸 값과 저장된 값을 합쳐 다시 검사한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 기간 규칙 위반, 결재라인 규칙 위반' })
    @ApiForbiddenResponse({ description: '기안자가 아님' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 볼 수 없는 문서, 휴가 신청이 없는 문서' })
    @ApiConflictResponse({ description: '임시저장 상태가 아님' })
    update(
        @User() user: Actor,
        @Param('documentId', ParseIntPipe) documentId: number,
        @Body() body: UpdateLeaveDto,
    ) {
        return this.leavesService.update( user, documentId, body );
    }
}
