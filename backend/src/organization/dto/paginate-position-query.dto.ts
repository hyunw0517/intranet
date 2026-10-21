import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SortOrder } from 'src/common/dto/base-pagination.dto';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

//* 정렬 가능 컬럼
export enum PositionSortBy {
    SORT_ORDER = 'sortOrder',
    CREATED_AT = 'createdAt',
    NAME = 'name',
}

//* 직급 목록 조회 필터 (GET query string)
export class PaginatePositionQueryDto extends PagePaginationDto {

    // 직급명 (?name=직급명)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

    // 정렬 기준 컬럼
    @IsOptional()
    @IsEnum( PositionSortBy )
    sortBy: PositionSortBy = PositionSortBy.SORT_ORDER;

    // 상속 order 기본값 변경 DESC->ASC
    order: SortOrder = SortOrder.ASC;
}
