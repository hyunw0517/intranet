import { Controller, Get, Query } from "@nestjs/common";
import { RequireAdmin } from "src/auth/decorator/require-admin.decorator";
import { AdminPermission } from "src/generated/prisma/client";
import { AuditLogsService } from "./audit-logs.service";
import { AuditLogListDto } from "./dto/audit-log-list.dto";

//* 감사 로그 조회 - AUDIT 기능을 지정받은 관리자와 슈퍼관리자 (2026-11-18 사용자 결정)
@Controller('common/audit-logs')
export class AuditLogsController {

    constructor(
        private readonly auditLogsService: AuditLogsService,
    ){}

    //* 목록 (?cursor=&take=&from=&to=&actionType=&targetType=&actor=)
    @Get()
    @RequireAdmin(AdminPermission.AUDIT)
    findList( @Query() query: AuditLogListDto ) {
        return this.auditLogsService.findList( query );
    }
}
