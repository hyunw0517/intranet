import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { DATE_ONLY, DATE_ONLY_MESSAGE } from './project.dto';

// 금액: 원화 정수, Decimal(15,0) → 최대 999,999,999,999,999원 (2026-11-17 사용자 결정, 견적·매출·예산 공통)
// JS number로 정확히 표현되는 범위(2^53) 안이라 요청은 숫자로 받고, 응답은 Prisma Decimal이 문자열로 직렬화된다.
export const MAX_AMOUNT = 999_999_999_999_999;

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

    // 외주 계약 금액 (원, 부가세 별도)
    @StringToNumber()
    @IsInt({ message: '계약 금액은 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    @IsOptional()
    @EmptyToNull()
    contractAmount?: number | null;

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

    // 협력사 담당자 (거래처 담당자를 고르지 않고 직접 적는다)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    contactName?: string | null;

    @IsString()
    @MaxLength(20)
    @IsOptional()
    @EmptyToNull()
    contactHp?: string | null;

    @IsEmail()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    contactEmail?: string | null;
}

//* 협력사 수정 (보낸 항목만) - 회사(clientId)는 바꾸지 않는다(다른 회사면 빼고 새로 추가)
export class UpdateProjectPartnerDto extends PartialType( OmitType( CreateProjectPartnerDto, [ 'clientId' ] as const ) ) {}
