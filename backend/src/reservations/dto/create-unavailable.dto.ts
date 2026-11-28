import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';

//* 사용 불가 기간 등록 (관리자) - 겹치는 기존 예약은 그대로 두고 경고 목록만 준다
export class CreateUnavailableDto {

    /** 시작 (ISO 문자열, 여러 날에 걸쳐도 된다) */
    @StringToDate()
    @IsDate()
    startAt: Date;

    /** 종료 (시작보다 뒤) */
    @StringToDate()
    @IsDate()
    endAt: Date;

    /** 사유 (점검 등) */
    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    reason?: string | null;
}
