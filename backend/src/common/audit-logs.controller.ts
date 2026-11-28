import { Controller, Get, Query } from "@nestjs/common";
import { RequireAdmin } from "src/auth/decorator/require-admin.decorator";
import { AdminPermission } from "src/generated/prisma/client";
import { AuditLogsService } from "./audit-logs.service";
import { AuditLogListDto } from "./dto/audit-log-list.dto";
import { ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

//* 감사 로그 조회 - AUDIT 기능을 지정받은 관리자와 슈퍼관리자
@ApiTags('Audit Logs (감사 로그)')
@Controller('common/audit-logs')
export class AuditLogsController {

    constructor(
        private readonly auditLogsService: AuditLogsService,
    ){}

    //* 목록 (?cursor=&take=&from=&to=&actionType=&targetType=&actor=)
    @Get()
    @RequireAdmin(AdminPermission.AUDIT)
    @ApiOperation({ summary: '(관리자) 감사 로그 목록', description: '항상 최신순, 커서 페이지(cursor = 마지막으로 받은 id, 그보다 작은 id를 준다). order는 쓰지 않는다. 기간(from~to)은 KST 날짜. 꺼진 애드온의 로그는 조회에서 뺀다(데이터는 남아 있다). id는 BigInt라 문자열로 내려간다.' })
    @ApiBadRequestResponse({ description: '쿼리 검증 실패(날짜는 YYYY-MM-DD), 시작일이 종료일보다 늦음' })
    findList( @Query() query: AuditLogListDto ) {
        return this.auditLogsService.findList( query );
    }
}
