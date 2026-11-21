import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { MAX_ATTACHMENTS_PER_TARGET } from 'src/common/const/file.const';
import { ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { MAX_AMOUNT } from '../../dto/project-partner.dto';
import { DATE_ONLY, DATE_ONLY_MESSAGE, VatRateField } from '../../dto/project.dto';

export const MAX_BUDGET_ITEMS = 200;

//* 비용 항목 만들기·이름 변경 (과제 관리 관리자)
export class SaveBudgetCategoryDto {

    @IsString()
    @Matches( /\S/, { message: '항목 이름을 입력해 주세요.' } ) // 공백만도 불가 (DB CHECK와 같은 규칙)
    @MaxLength(50)
    name: string;
}

//* 전사 통계 조회 조건 (모두 선택) - 연도가 없으면 최근 12개월, 프로젝트·거래처가 없으면 전체
export class ProjectStatsQueryDto {

    @StringToNumber()
    @IsInt()
    @Min(2000)
    @Max(2100)
    @IsOptional()
    year?: number;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    projectId?: number;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    clientId?: number;
}

//* 항목별 예산 한 줄
export class BudgetItemDto {

    @StringToNumber()
    @IsInt()
    categoryId: number;

    /** 예산 (공급가액 기준, 원 단위 정수) */
    @StringToNumber()
    @IsInt({ message: '예산은 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    amount: number;
}

//* 항목별 예산 저장 (참여자 누구나) - 목록 전체 교체
export class SaveProjectBudgetsDto {

    @IsArray()
    @ArrayMaxSize(MAX_BUDGET_ITEMS)
    @ValidateNested({ each: true })
    @Type(() => BudgetItemDto)
    items: BudgetItemDto[];
}

//* 지출 기록 (참여자 누구나) - 예산을 넘어도 저장한다(경고만)
export class CreateProjectExpenseDto {

    @StringToNumber()
    @IsInt()
    categoryId: number;

    /** 지급한 협력사 (선택) */
    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    partnerId?: number | null;

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    title: string;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    expenseDate: string;

    @ApiProperty({ enum: ProjectQuoteTaxType, enumName: 'ProjectQuoteTaxType', required: false })
    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    /** 부가세율(%) - 직접 입력, 기본 10, 면세면 무시 */
    @VatRateField()
    vatRate?: number;

    /** 공급가액 (원 단위 정수) - 부가세·합계는 서버 계산, 예산과는 이 금액으로 비교 */
    @StringToNumber()
    @IsInt({ message: '공급가액은 원 단위 정수입니다.' })
    @Min(1)
    @Max(MAX_AMOUNT)
    supplyAmount: number;

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;

    /** 증빙 파일 (먼저 POST /common/files/attachments로 올린 id, 보내면 전체 교체) */
    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 지출 수정 (보낸 항목만)
export class UpdateProjectExpenseDto {

    @StringToNumber()
    @IsInt()
    @IsOptional()
    categoryId?: number;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    partnerId?: number | null;

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    @IsOptional()
    title?: string;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    expenseDate?: string;

    @ApiProperty({ enum: ProjectQuoteTaxType, enumName: 'ProjectQuoteTaxType', required: false })
    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    @VatRateField()
    vatRate?: number;

    @StringToNumber()
    @IsInt({ message: '공급가액은 원 단위 정수입니다.' })
    @Min(1)
    @Max(MAX_AMOUNT)
    @IsOptional()
    supplyAmount?: number;

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}
