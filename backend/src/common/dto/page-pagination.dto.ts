import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from "class-validator";
import { StringToNumber } from "../decorator/string-to-number.decorator";
import { BasePaginationDto } from "./base-pagination.dto";

export class PagePaginationDto extends BasePaginationDto {
    /** 페이지 번호 (1부터) */
    @ApiProperty({ required: false, default: 1 })
    @StringToNumber()
    @IsInt()
    @Min(1)
    page: number = 1;
}