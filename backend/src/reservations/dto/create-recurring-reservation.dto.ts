import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { HM_REGEX } from './create-facility-category.dto';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

//* 반복 예약 - 기간(KST 날짜) 중 고른 요일마다 같은 시간대로 예약을 하나씩 만든다. (묶음 정보는 없음)
// 이미 예약된 날짜·사용 불가 기간·운영하지 않는 요일·이미 지난 시각은 건너뛰고 응답에 이유를 담는다.
export class CreateRecurringReservationDto {

    @StringToNumber()
    @IsInt()
    facilityId: number;

    // "2026-11-12" (KST 날짜, 종료일 포함)
    @Matches( DATE_REGEX, { message: 'startDate는 YYYY-MM-DD 형식이어야 합니다.' } )
    startDate: string;

    @Matches( DATE_REGEX, { message: 'endDate는 YYYY-MM-DD 형식이어야 합니다.' } )
    endDate: string;

    // 반복할 요일 (ISO: 1 = 월 … 7 = 일, 모두 고르면 매일)
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(7)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(7, { each: true })
    weekdays: number[];

    // 매번 같은 시간대 ("10:00" ~ "11:00")
    @Matches( HM_REGEX, { message: 'startTime은 HH:mm 형식이어야 합니다.' } )
    startTime: string;

    @Matches( HM_REGEX, { message: 'endTime은 HH:mm 형식이어야 합니다.' } )
    endTime: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    title?: string | null;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;
}
