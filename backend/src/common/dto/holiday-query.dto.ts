import { IsInt, Max, Min } from "class-validator";
import { StringToNumber } from "../decorator/string-to-number.decorator";

//* 공휴일 조회 (?year=2026)
export class HolidayQueryDto {
    @StringToNumber()
    @IsInt()
    @Min( 1900 )
    @Max( 2100 )
    year: number;
}
