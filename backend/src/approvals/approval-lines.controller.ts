import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { ApprovalLinesService } from './approval-lines.service';
import { CreateApprovalLineDto, ManageApprovalLineQueryDto, UpdateApprovalLineDto } from './dto/approval-line.dto';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 결재라인 템플릿 - 공용·부서는 결재라인 관리자(서비스에서 판정), 개인은 본인
// 고정 경로(manage)는 ':id'보다 먼저 선언한다.
@ApiTags('Approvals · Lines (결재라인 템플릿)')
@Controller('approvals/lines')
export class ApprovalLinesController {

    constructor(
        private readonly approvalLinesService: ApprovalLinesService,
    ){}

    //* 내가 불러올 수 있는 템플릿 (공용 + 내 부서 + 내 개인)
    @Get()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '불러올 수 있는 결재라인', description: '공용 + 내 부서(겸직 포함) + 내 개인 템플릿. 템플릿은 결재자 목록을 채우는 불러오기용이고 불러온 뒤 고칠 수 있다. 삭제·퇴사한 결재자는 사용할 수 없는 결재자로 표시한다.' })
    findUsable( @User() user: Actor ) {
        return this.approvalLinesService.findUsable( user );
    }

    //* 내가 관리할 수 있는 공용·부서 템플릿 (권한 없으면 403)
    @Get('manage')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내가 관리할 수 있는 공용·부서 결재라인', description: '결재라인 관리자(ADMIN 또는 위임 규칙으로 지정된 회원·직책)만. 개인 결재라인은 이 목록에서 다루지 않는다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패, scope=PERSONAL' })
    @ApiForbiddenResponse({ description: '결재라인 관리 권한 없음' })
    findManageable(
        @User() user: Actor,
        @Query() query: ManageApprovalLineQueryDto,
    ) {
        return this.approvalLinesService.findManageable( user, query );
    }

    @Post()
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재라인 템플릿 생성', description: '개인(PERSONAL)은 본인이 만들고 소유자는 로그인 회원이다. 공용(ADMIN)·부서(DEPARTMENT)는 그 범위의 결재라인 관리자만 만든다. 부서 템플릿만 departmentId를 지정한다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 부서 템플릿에 부서가 없음, 부서 템플릿이 아닌데 부서 지정, 결재라인 규칙 위반' })
    @ApiForbiddenResponse({ description: '이 범위의 결재라인을 관리할 권한 없음' })
    @ApiNotFoundResponse({ description: '존재하지 않는 부서' })
    create(
        @User() user: Actor,
        @Body() body: CreateApprovalLineDto,
    ) {
        return this.approvalLinesService.create( user, body );
    }

    @Patch(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재라인 템플릿 수정', description: '이름·단계 전체 교체(범위·부서는 바꿀 수 없다). 남의 개인 템플릿은 관리자도 보지 않으며 404.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 결재라인 규칙 위반' })
    @ApiForbiddenResponse({ description: '이 결재라인을 관리할 권한 없음' })
    @ApiNotFoundResponse({ description: '존재하지 않는 결재라인(남의 개인 템플릿 포함)' })
    update(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
        @Body() body: UpdateApprovalLineDto,
    ) {
        return this.approvalLinesService.update( user, id, body );
    }

    @Delete(':id')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '결재라인 템플릿 삭제' })
    @ApiForbiddenResponse({ description: '이 결재라인을 관리할 권한 없음' })
    @ApiNotFoundResponse({ description: '존재하지 않는 결재라인(남의 개인 템플릿 포함)' })
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.approvalLinesService.delete( user, id );
    }
}
