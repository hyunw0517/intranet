import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { StringToNumber } from "../decorator/string-to-number.decorator";

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export class BasePaginationDto {

    // 한 번에 출력되는 데이터 수
    @StringToNumber()
    @IsInt()
    @Min(1)
    @Max(100)
    take: number = 20; //default 값: 20

    // 정렬
    // 오름차/내림차순 정렬 방향 (정렬 기준 컬럼은 도메인 DTO의 sortBy enum, orderBy는 Service에서 지정)
    @IsEnum(SortOrder)
    @IsOptional()
    order: SortOrder = SortOrder.DESC;

}