import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { MAX_AMOUNT } from '../../dto/project-partner.dto';
import { DATE_ONLY, DATE_ONLY_MESSAGE } from '../../dto/project.dto';

export const MAX_QUOTE_ITEMS = 100;
export const MAX_QUANTITY = 1_000_000;

//* 품목 행 - 금액은 서버가 수량 × 단가로 계산한다
export class QuoteItemDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 200)
    name: string;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    spec?: string | null;

    @StringToNumber()
    @IsInt({ message: '수량은 정수입니다.' })
    @Min(1)
    @Max(MAX_QUANTITY)
    quantity: number;

    // 단가 (원 단위 정수)
    @StringToNumber()
    @IsInt({ message: '단가는 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    unitPrice: number;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    note?: string | null;
}

//* 견적 내용 (만들기·작성 중 버전 저장 공용) - 품목은 보내면 전체 교체
export class QuoteContentDto {

    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    // 견적일 (없으면 오늘)
    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    quoteDate?: string;

    // 유효기간 (견적일 이후)
    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    validUntil?: string | null;

    // 수신 담당자 (발주처 거래처의 담당자 중 하나, NULL = 지정 안 함)
    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    contactId?: number | null;

    @IsString()
    @MaxLength(2000)
    @IsOptional()
    @EmptyToNull()
    note?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_QUOTE_ITEMS)
    @ValidateNested({ each: true })
    @Type(() => QuoteItemDto)
    @IsOptional()
    items?: QuoteItemDto[];
}

//* 견적 만들기 (v1, 작성 중)
export class CreateProjectQuoteDto extends QuoteContentDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    title: string;
}

//* 작성 중 버전 저장 (견적명도 함께 바꿀 수 있다)
export class UpdateProjectQuoteDto extends QuoteContentDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    @IsOptional()
    title?: string;
}
