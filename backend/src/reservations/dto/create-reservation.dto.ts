import { IsDate, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';

//* 시설 예약 (단건) - 시각은 시간대가 있는 ISO 문자열 ("2026-11-12T10:00:00+09:00")
// 범위는 [startAt, endAt). 하루 안·운영 시간·예약 단위 등 분류 규칙은 서비스에서 확인한다.
export class CreateReservationDto {

    @StringToNumber()
    @IsInt()
    facilityId: number;

    @StringToDate()
    @IsDate()
    startAt: Date;

    @StringToDate()
    @IsDate()
    endAt: Date;

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
