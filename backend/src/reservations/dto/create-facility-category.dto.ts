import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, IsNotEmpty, IsString, Length, Matches, Max, Min } from 'class-validator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';

// "HH:mm" (00:00 ~ 24:00) - 범위는 서비스의 parseHm에서 다시 확인한다.
export const HM_REGEX = /^\d{2}:\d{2}$/;

//* 시설 분류 생성 (관리자) - 분류가 그 시설들의 예약 규칙을 정한다. (features.md 6장)
export class CreateFacilityCategoryDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    name: string;

    // 예약 단위(분)
    @StringToNumber()
    @IsInt()
    @Min(5)
    @Max(720)
    slotMinutes: number;

    // 운영 시작·종료 ("09:00", "18:00", 24시간 운영은 "00:00"~"24:00")
    @Matches( HM_REGEX, { message: 'openTime은 HH:mm 형식이어야 합니다.' } )
    openTime: string;

    @Matches( HM_REGEX, { message: 'closeTime은 HH:mm 형식이어야 합니다.' } )
    closeTime: string;

    // 운영 요일 (ISO: 1 = 월 … 7 = 일)
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(7)
    @ArrayUnique()
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(7, { each: true })
    operatingDays: number[];

    // 오늘부터 며칠 앞까지 예약 가능
    @StringToNumber()
    @IsInt()
    @Min(1)
    @Max(365)
    maxAdvanceDays: number;
}
