import { IsInt, Max, Min } from "class-validator";
import { StringToNumber } from "../decorator/string-to-number.decorator";

//* 공휴일 조회 (?year=2026)
export class HolidayQueryDto {
    /**
     * 연도 (올해 앞뒤 2년 밖이면 외부 호출 없이 빈 목록)
     * @example 2026
     */
    @StringToNumber()
    @IsInt()
    @Min( 1900 )
    @Max( 2100 )
    year: number;
}
