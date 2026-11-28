import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional } from "class-validator";
import { ApprovalLineManagerScope } from "src/generated/prisma/client";

//* 결재라인 관리자 규칙 등록 (ADMIN)
// userId / jobTitleId 중 정확히 하나. DEPARTMENT 범위는 departmentId 필요, MY_DEPARTMENT는 직책 대상만.
// 조합 검사는 서비스, 최종 방어는 DB CHECK 제약
export class CreateLineManagerDto {

    /** 대상 회원 id (jobTitleId와 둘 중 정확히 하나) */
    @IsInt()
    @IsOptional()
    userId?: number;

    /** 대상 직책 id (userId와 둘 중 정확히 하나) */
    @IsInt()
    @IsOptional()
    jobTitleId?: number;

    /** 관리 범위 (ALL 공용+모든 부서 / DEPARTMENT 지정한 부서 / MY_DEPARTMENT 직책 대상만 - 그 직책으로 소속된 부서). 맡은 부서의 하위 부서도 관리한다 */
    @ApiProperty({ enum: ApprovalLineManagerScope, enumName: 'ApprovalLineManagerScope' })
    @IsEnum(ApprovalLineManagerScope)
    scope: ApprovalLineManagerScope;

    /** 부서 id (scope가 DEPARTMENT일 때만) */
    @IsInt()
    @IsOptional()
    departmentId?: number;
}
