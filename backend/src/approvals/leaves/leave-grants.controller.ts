import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, Users } from 'src/generated/prisma/client';
import { AdjustLeaveGrantDto, LeaveGrantListQueryDto } from './dto/leave.dto';
import { LeaveGrantsService } from './leave-grants.service';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 관리자 연차 관리 (docs/design/leave_calculate_manual.md)
@ApiTags('Approvals · Leave Grants (연차 관리)')
@Controller('approvals/leaves/grants')
export class LeaveGrantsController {

    constructor(
        private readonly grantsService: LeaveGrantsService,
    ){}

    //* 연차 현황 (?year=&search=&page=&take=)
    @Get()
    @RequireAdmin(AdminPermission.LEAVES)
    @ApiOperation({ summary: '(관리자) 연차 현황', description: '회원별 부여(계산값 + 영구 조정 + 매년 조정)·사용·잔여. 이름·사번 검색, 페이지. 연차 계산식은 docs/design/leave_calculate_manual.md.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패' })
    findList( @Query() query: LeaveGrantListQueryDto ) {
        return this.grantsService.findList( query );
    }

    //* 지금 재계산 (월 배치와 같은 서비스)
    @Post('recalculate')
    @RequireAdmin(AdminPermission.LEAVES)
    @ApiOperation({ summary: '(관리자) 연차 지금 재계산', description: '월 배치와 같은 서비스. 오늘 기준 올해 행을 다시 계산하고, 12월이면 다음 해 행도 만든다. 관리자 조정값은 지워지지 않는다(계산값과 조정값을 나눠 저장). 입사일을 바꾼 뒤 바로 반영할 때 쓴다.' })
    recalculate( @User() user: Pick<Users, 'id'> ) {
        return this.grantsService.recalculate( user.id );
    }

    //* 조정값·사유 저장 (year를 비우면 올해)
    @Patch(':userId')
    @RequireAdmin(AdminPermission.LEAVES)
    @ApiOperation({ summary: '(관리자) 연차 조정', description: '매년 조정(그 연도에만, 이월·포상·차감 등)과 영구 조정(매년 더함, 근속 인정 등)을 함께 저장한다. 값은 누적이 아니라 그 연도의 조정 총합이고 0.25일 단위. 0이 아닌 조정은 사유 필수. 올해와 다음 해(12월에 행이 생긴 뒤)만 바꿀 수 있고 지난 연도는 바꾸지 않는다. 부여 합계가 0보다 작아지면 안 된다(조정 후 잔여가 음수인 것은 허용).' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 0.25일 단위가 아님, 사유 없음, 올해·다음 해가 아님, 부여 합계가 0 미만' })
    @ApiNotFoundResponse({ description: '그 연도의 연차 행이 없음 (올해: 입사일 확인 후 재계산 / 다음 해: 12월 재계산 뒤 조정)' })
    adjust(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body: AdjustLeaveGrantDto,
    ) {
        return this.grantsService.adjust( userId, body );
    }
}
