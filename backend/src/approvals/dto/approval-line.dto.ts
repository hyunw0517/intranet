import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";
import { StringToNumber } from "src/common/decorator/string-to-number.decorator";
import { ApprovalLineScope } from "src/generated/prisma/client";
import { MAX_APPROVAL_STEPS } from "../const/approval.const";

//* 결재자 한 단계 (템플릿·문서 공통) - 배열 순서 = 결재 순서
export class ApprovalStepInputDto {

    @IsInt()
    approverId: number;

    // 단계명 (예: 팀장 검토)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    name?: string | null;
}

//* 결재라인 템플릿 생성
// PERSONAL: 소유자는 로그인 회원 / ADMIN(공용)·DEPARTMENT(부서): 결재라인 관리자만
export class CreateApprovalLineDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsEnum(ApprovalLineScope)
    scope: ApprovalLineScope;

    // scope = DEPARTMENT일 때만
    @IsInt()
    @IsOptional()
    departmentId?: number;

    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    steps: ApprovalStepInputDto[];
}

//* 결재라인 템플릿 수정 - 이름·단계 전체 교체 (scope·부서는 바꿀 수 없다)
export class UpdateApprovalLineDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    @IsOptional()
    name?: string;

    @IsArray()
    @ArrayMaxSize(MAX_APPROVAL_STEPS)
    @ValidateNested({ each: true })
    @Type(() => ApprovalStepInputDto)
    @IsOptional()
    steps?: ApprovalStepInputDto[];
}

//* 관리할 수 있는 공용·부서 결재라인 목록 필터
export class ManageApprovalLineQueryDto {

    @IsEnum(ApprovalLineScope)
    @IsOptional()
    scope?: ApprovalLineScope;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    departmentId?: number;
}
