import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { MAX_ATTACHMENTS_PER_TARGET } from 'src/common/const/file.const';
import { ProjectQuoteTaxType } from 'src/generated/prisma/client';
import { MAX_AMOUNT } from '../../dto/project-partner.dto';
import { DATE_ONLY, DATE_ONLY_MESSAGE, VatRateField } from '../../dto/project.dto';

// 세금계산서 승인번호: 국세청 24자리(하이픈 포함 26자). 표기가 다양해 숫자·하이픈만 허용하고 길이로만 막는다
const INVOICE_NO = /^[0-9-]{1,30}$/;

//* 청구 건 만들기 (참여자 누구나) - 청구일을 함께 보내면 바로 "청구" 상태로 만든다
export class CreateProjectSaleDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    title: string;

    // 확정 견적 버전 (선택) - 연결하면 그 견적의 청구 합계 ≤ 견적 합계
    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    quoteVersionId?: number | null;

    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    // 부가세율(%) - 직접 입력, 기본 10, 면세면 무시 (2026-11-17 사용자 결정)
    @VatRateField()
    vatRate?: number;

    // 공급가액 (원 단위 정수) - 부가세·합계는 서버 계산
    @StringToNumber()
    @IsInt({ message: '공급가액은 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    supplyAmount: number;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    plannedDate?: string | null;

    // 청구일 (= 매출 기준일 = 세금계산서 발행일). 있으면 "청구" 상태
    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    billedDate?: string | null;

    @Matches( INVOICE_NO, { message: '승인번호는 숫자와 하이픈만 입력합니다.' } )
    @IsOptional()
    @EmptyToNull()
    taxInvoiceNo?: string | null;

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;

    // 세금계산서 파일 (먼저 POST /common/files/attachments로 올린 id, 순서 = 표시 순서, 보내면 전체 교체)
    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 청구 건 수정 (보낸 항목만) - 청구 예정이면 전부, 청구한 뒤에는 청구명·승인번호·메모·첨부만
export class UpdateProjectSaleDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    @IsOptional()
    title?: string;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    quoteVersionId?: number | null;

    @IsEnum(ProjectQuoteTaxType)
    @IsOptional()
    taxType?: ProjectQuoteTaxType;

    // 부가세율(%) - 직접 입력, 기본 10, 면세면 무시 (2026-11-17 사용자 결정)
    @VatRateField()
    vatRate?: number;

    @StringToNumber()
    @IsInt({ message: '공급가액은 원 단위 정수입니다.' })
    @Min(0)
    @Max(MAX_AMOUNT)
    @IsOptional()
    supplyAmount?: number;

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    plannedDate?: string | null;

    @Matches( INVOICE_NO, { message: '승인번호는 숫자와 하이픈만 입력합니다.' } )
    @IsOptional()
    @EmptyToNull()
    taxInvoiceNo?: string | null;

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

//* 청구 처리 (청구 예정 → 청구)
export class BillProjectSaleDto {

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    billedDate: string;

    @Matches( INVOICE_NO, { message: '승인번호는 숫자와 하이픈만 입력합니다.' } )
    @IsOptional()
    @EmptyToNull()
    taxInvoiceNo?: string | null;

    @IsArray()
    @ArrayMaxSize(MAX_ATTACHMENTS_PER_TARGET)
    @IsInt({ each: true })
    @IsOptional()
    attachmentIds?: number[];
}

//* 수금 기록 (부분 수금 가능)
export class CreateSalePaymentDto {

    @Matches( DATE_ONLY, { message: DATE_ONLY_MESSAGE } )
    @IsDateString()
    paidDate: string;

    @StringToNumber()
    @IsInt({ message: '수금액은 원 단위 정수입니다.' })
    @Min(1)
    @Max(MAX_AMOUNT)
    amount: number;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;
}
