import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { DATE_ONLY, DATE_ONLY_MESSAGE, VatRateField } from './project.dto';

// 금액: 원화 정수, Decimal(15,0) → 최대 999,999,999,999,999원 (2026-11-17 사용자 결정, 견적·매출·예산 공통)
// JS number로 정확히 표현되는 범위(2^53) 안이라 요청은 숫자로 받고, 응답은 Prisma Decimal이 문자열로 직렬화된다.
export const MAX_AMOUNT = 999_999_999_999_999;
export const MAX_PARTNER_CONTACTS = 20;

//* 협력사 담당자 한 명 (2026-11-17 사용자 결정: 직접 기재, 여러 명)
export class PartnerContactDto {

    @IsString()
    @Matches( /\S/, { message: '담당자 이름을 입력해 주세요.' } ) // 공백만도 불가 (DB CHECK와 같은 규칙)
    @IsNotEmpty({ message: '담당자 이름을 입력해 주세요.' })
    @MaxLength(50)
    name: string;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    role?: string | null; // 예: PM, 실무, 정산

    @IsString()
    @MaxLength(20)
    @IsOptional()
    @EmptyToNull()
    hp?: string | null;

    @IsEmail()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    email?: string | null;
}

//* 협력사 추가 (참여자 누구나) - 거래처 목록에서 회사를 고르고 계약 정보를 직접 적는다
export class CreateProjectPartnerDto {

    @StringToNumber()
    @IsInt()
    clientId: number;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    @EmptyToNull()
    workScope?: string | null;

    /** 외주 계약 금액 = 공급가액 (원, 부가세 별도) - 부가세·합계는 서버가 과세 구분·부가세율로 계산 */
    @StringToNumber()
    @IsInt({ message: '계약 금액은 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    @IsOptional()
    @EmptyToNull()
    contractAmount?: number | null;

    /** 과세 / 면세 (2026-11-17 사용자 결정: 외주 금액도 부가세 계산) */
    @ApiProperty({ enum: ProjectQuoteTaxType, enumName: 'ProjectQuoteTaxType', required: false })
    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    /** 부가세율(%) - 직접 입력, 기본 10, 면세면 무시 */
    @VatRateField()
    vatRate?: number;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    startDate?: string | null;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    endDate?: string | null;

    /** 협력사 담당자 (거래처 담당자를 고르지 않고 직접 적는다, 여러 명) - 보내면 목록 전체 교체, 보낸 순서가 표시 순서 */
    @IsArray()
    @ArrayMaxSize(MAX_PARTNER_CONTACTS)
    @ValidateNested({ each: true })
    @Type(() => PartnerContactDto)
    @IsOptional()
    contacts?: PartnerContactDto[];
}

//* 협력사 수정 (보낸 항목만) - 회사(clientId)는 바꾸지 않는다(다른 회사면 빼고 새로 추가)
export class UpdateProjectPartnerDto extends PartialType( OmitType( CreateProjectPartnerDto, [ 'clientId' ] as const ) ) {}
