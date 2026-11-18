import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { AuditActionType, AuditTargetType } from "src/generated/prisma/client";
import { CursorPaginationDto } from "./cursor-pagination.dto";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

//* 감사 로그 목록 (커서 페이지네이션, 항상 최신순 - order는 쓰지 않는다)
export class AuditLogListDto extends CursorPaginationDto {
    // 조회 시작일 (KST, 그날 00:00부터)
    @Matches( DATE_ONLY, { message: 'from은 YYYY-MM-DD 형식이어야 합니다.' } )
    @IsISO8601({ strict: true })
    @IsOptional()
    from?: string;

    // 조회 종료일 (KST, 그날 24:00까지)
    @Matches( DATE_ONLY, { message: 'to는 YYYY-MM-DD 형식이어야 합니다.' } )
    @IsISO8601({ strict: true })
    @IsOptional()
    to?: string;

    @IsEnum( AuditActionType )
    @IsOptional()
    actionType?: AuditActionType;

    @IsEnum( AuditTargetType )
    @IsOptional()
    targetType?: AuditTargetType;

    // 작업자 이름 또는 사번 (부분 일치)
    @IsString()
    @MaxLength( 50 )
    @IsOptional()
    actor?: string;
}
