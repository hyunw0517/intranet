import { IsInt, IsOptional } from 'class-validator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';

//* 시설 목록 필터 (?categoryId=)
export class FacilityListQueryDto {

    @StringToNumber()
    @IsInt()
    @IsOptional()
    categoryId?: number;
}
