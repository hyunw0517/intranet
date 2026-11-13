import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { User } from 'src/auth/decorator/user.decorator';
import { UserRole, Users } from 'src/generated/prisma/client';
import { CreateLineManagerDto } from './dto/line-manager.dto';
import { LineManagersService } from './line-managers.service';

type Actor = Pick<Users, 'id' | 'role'>;

//* 결재라인 관리자 규칙 - 등록·해제·목록은 ADMIN, 내 관리 범위(me)는 전원
@Controller('approvals/line-managers')
export class LineManagersController {

    constructor(
        private readonly lineManagersService: LineManagersService,
    ){}

    //* 내 관리 범위 { all, departmentIds, departments } - 프론트가 관리 메뉴·버튼 표시와 부서 선택지를 정한다
    @Get('me')
    @Roles(UserRole.USER)
    me( @User() user: Actor ) {
        return this.lineManagersService.myScope( user );
    }

    @Get()
    @Roles(UserRole.ADMIN)
    findAll() {
        return this.lineManagersService.findAll();
    }

    @Post()
    @Roles(UserRole.ADMIN)
    create(
        @User() user: Actor,
        @Body() body: CreateLineManagerDto,
    ) {
        return this.lineManagersService.create( user, body );
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    delete(
        @User() user: Actor,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.lineManagersService.delete( user, id );
    }
}
