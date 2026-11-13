import { IsEnum, IsInt, IsOptional } from "class-validator";
import { ApprovalLineManagerScope } from "src/generated/prisma/client";

//* 결재라인 관리자 규칙 등록 (ADMIN)
// 대상: userId / jobTitleId 중 정확히 하나. 범위 DEPARTMENT는 departmentId 필요, MY_DEPARTMENT는 직책 대상만.
// (조합 검사는 서비스, 최종 방어는 DB CHECK 제약)
export class CreateLineManagerDto {

    @IsInt()
    @IsOptional()
    userId?: number;

    @IsInt()
    @IsOptional()
    jobTitleId?: number;

    @IsEnum(ApprovalLineManagerScope)
    scope: ApprovalLineManagerScope;

    @IsInt()
    @IsOptional()
    departmentId?: number;
}
