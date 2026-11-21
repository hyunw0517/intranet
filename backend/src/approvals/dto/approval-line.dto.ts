import { ApiProperty } from '@nestjs/swagger';
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";
import { StringToNumber } from "src/common/decorator/string-to-number.decorator";
import { ApprovalLineScope } from "src/generated/prisma/client";
import { MAX_APPROVAL_STEPS } from "../const/approval.const";

//* 결재 한 단계 (템플릿·문서 공통) - steps 배열 순서 = 결재 순서
// 한 단계에 여러 명이면 병렬: 모두 승인해야 다음 단계, 한 명이라도 반려하면 문서 반려 (2026-11-10 사용자 결정)
export class ApprovalStepInputDto {

    /** 이 단계의 결재자 회원 id (1명 이상, 문서 전체 결재자는 1~10명) */
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @IsInt({ each: true })
    approverIds: number[];

    /** 단계명 (예: 팀장 검토) - 템플릿만 저장한다 (문서 단계에는 단계명 컬럼이 없음) */
    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    name?: string | null;
}

//* 결재라인 템플릿 생성
// PERSONAL: 소유자는 로그인 회원 / ADMIN(공용)·DEPARTMENT(부서): 결재라인 관리자만
export class CreateApprovalLineDto {

    /** 이름 (최대 100자) */
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    /** 범위 (PERSONAL 개인 / DEPARTMENT 부서 / ADMIN 공용) */
    @ApiProperty({ enum: ApprovalLineScope, enumName: 'ApprovalLineScope' })
    @IsEnum(ApprovalLineScope)
    scope: ApprovalLineScope;

    /** scope = DEPARTMENT일 때만 */
    @IsInt()
    @IsOptional()
    departmentId?: number;

    /** 단계 목록 (배열 순서 = 결재 순서) */
    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    steps: ApprovalStepInputDto[];
}

//* 결재라인 템플릿 수정 - 이름·단계 전체 교체 (scope·부서는 바꿀 수 없다)
export class UpdateApprovalLineDto {

    /** 이름 (최대 100자) */
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @IsOptional()
    name?: string;

    /** 단계 목록 (배열 순서 = 결재 순서) */
    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    @IsOptional()
    steps?: ApprovalStepInputDto[];
}

//* 관리할 수 있는 공용·부서 결재라인 목록 필터
export class ManageApprovalLineQueryDto {

    /** 범위 (PERSONAL 개인 / DEPARTMENT 부서 / ADMIN 공용) */
    @ApiProperty({ enum: ApprovalLineScope, enumName: 'ApprovalLineScope', required: false })
    @IsEnum(ApprovalLineScope)
    @IsOptional()
    scope?: ApprovalLineScope;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    departmentId?: number;
}
