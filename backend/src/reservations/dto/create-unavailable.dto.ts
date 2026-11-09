import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';

//* 사용 불가 기간 등록 (관리자) - 여러 날에 걸쳐도 된다. 겹치는 기존 예약은 그대로 두고 응답에 경고 목록을 담는다.
export class CreateUnavailableDto {

    @StringToDate()
    @IsDate()
    startAt: Date;

    @StringToDate()
    @IsDate()
    endAt: Date;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    reason?: string | null;
}
