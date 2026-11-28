import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { RequireAdmin } from 'src/auth/decorator/require-admin.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { AdminPermission, UserRole, Users } from 'src/generated/prisma/client';
import { CreateLineManagerDto } from './dto/line-manager.dto';
import { LineManagersService } from './line-managers.service';
import { ApiBadRequestResponse, ApiConflictResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

type Actor = Pick<Users, 'id' | 'role' | 'adminPermissions'>;

//* 결재라인 관리자 규칙 - 등록·해제·목록은 ADMIN, 내 관리 범위(me)는 전원
@ApiTags('Approvals · Line Managers (결재라인 관리자)')
@Controller('approvals/line-managers')
export class LineManagersController {

    constructor(
        private readonly lineManagersService: LineManagersService,
    ){}

    //* 내 관리 범위 (프론트의 관리 메뉴·부서 선택지용)
    @Get('me')
    @Roles(UserRole.USER)
    @ApiOperation({ summary: '내 결재라인 관리 범위', description: '`{ all, departmentIds, departments }`. 프론트가 관리 메뉴·버튼 표시와 부서 선택지를 정한다. 위임 규칙은 토큰에 넣지 않고 요청마다 DB로 판정해 지정·해제가 즉시 반영된다.' })
    me( @User() user: Actor ) {
        return this.lineManagersService.myScope( user );
    }

    @Get()
    @RequireAdmin(AdminPermission.APPROVAL_LINES)
    @ApiOperation({ summary: '(관리자) 결재라인 관리자 규칙 목록', description: '삭제된 부서·직책의 규칙은 "(삭제된 부서/직책)"으로 표시되어 관리자가 직접 지운다.' })
    findAll() {
        return this.lineManagersService.findAll();
    }

    @Post()
    @RequireAdmin(AdminPermission.APPROVAL_LINES)
    @ApiOperation({ summary: '(관리자) 결재라인 관리자 규칙 등록', description: '대상 1개(회원 또는 직책) + 범위. 예: 회원 → 전체 / 회원 → 영업부 / 직책 팀장 → 본인 부서. ADMIN은 규칙 없이도 항상 관리할 수 있다.' })
    @ApiBadRequestResponse({ description: '입력 검증 실패, 대상이 회원·직책 둘 다이거나 없음, 특정 부서 범위가 아닌데 부서 지정, 본인 부서 범위를 회원 대상에 씀' })
    @ApiNotFoundResponse({ description: '존재하지 않거나 승인되지 않은 회원, 존재하지 않는 직책·부서' })
    @ApiConflictResponse({ description: '같은 규칙이 이미 있음' })
    create(
        @User() user: Actor,
        @Body() body: CreateLineManagerDto,
    ) {
        return this.lineManagersService.create( user, body );
    }

    @Delete(':id')
    @RequireAdmin(AdminPermission.APPROVAL_LINES)
    @ApiOperation({ summary: '(관리자) 결재라인 관리자 규칙 삭제' })
    @ApiNotFoundResponse({ description: '존재하지 않는 규칙' })
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.lineManagersService.delete( user, id );
    }
}
