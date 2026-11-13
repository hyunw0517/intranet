import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from 'src/auth/decorator/roles.decorator';
import { UserRole } from 'src/generated/prisma/client';
import { ApproversService } from './approvers.service';

export class ApproverSearchQueryDto {
    @IsString()
    @MaxLength(50)
    @IsOptional()
    search?: string;
}

//* 결재자 후보 검색 (결재라인 지정 화면) - 지정할 수 있는 회원만, 최대 20명
@Controller('approvals/approvers')
export class ApproversController {

    constructor(
        private readonly approversService: ApproversService,
    ){}

    @Get()
    @Roles(UserRole.USER)
    search( @Query() query: ApproverSearchQueryDto ) {
        return this.approversService.search( query.search );
    }
}
