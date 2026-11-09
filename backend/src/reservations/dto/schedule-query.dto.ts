import { IsDate, IsInt, IsOptional } from 'class-validator';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';

//* 시간표 조회 (?facilityId= 또는 ?categoryId= 중 하나 + from·to)
// 기간은 [from, to), 시간대가 있는 ISO 문자열 (쿼리의 "+09:00"은 %2B로 인코딩)
export class ScheduleQueryDto {

    @StringToNumber()
    @IsInt()
    @IsOptional()
    facilityId?: number;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    categoryId?: number;

    @StringToDate()
    @IsDate()
    from: Date;

    @StringToDate()
    @IsDate()
    to: Date;
}
