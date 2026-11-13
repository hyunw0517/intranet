import { IsInt, IsOptional, Min } from "class-validator";
import { StringToNumber } from "../decorator/string-to-number.decorator";
import { BasePaginationDto } from "./base-pagination.dto";

export class CursorPaginationDto extends BasePaginationDto {
    // 마지막으로 받은 데이터의 id (첫 요청은 생략)
    @StringToNumber()
    @IsInt()
    @Min(1)
    @IsOptional()
    cursor?: number;
}