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

    /**
     * 시작 (시간대가 있는 ISO 문자열, 범위는 [startAt, endAt))
     * @example "2026-11-12T10:00:00+09:00"
     */
    @StringToDate()
    @IsDate()
    startAt: Date;

    /**
     * 종료 (시작과 같은 날, 분류의 운영 시간·예약 단위에 맞아야 한다)
     * @example "2026-11-12T11:00:00+09:00"
     */
    @StringToDate()
    @IsDate()
    endAt: Date;

    /** 예약 제목 (시간표에 모든 회원에게 공개) */
    @IsString()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    title?: string | null;

    /** 설명 */
    @IsString()
    @MaxLength(500)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;
}
