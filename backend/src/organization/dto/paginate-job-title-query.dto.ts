import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SortOrder } from 'src/common/dto/base-pagination.dto';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

//* 정렬 가능 컬럼
export enum JobTitleSortBy {
    SORT_ORDER = 'sortOrder',
    CREATED_AT = 'createdAt',
    NAME = 'name',
}

//* 직책 목록 조회 필터 (GET query string)
export class PaginateJobTitleQueryDto extends PagePaginationDto {

    // 직책명 (?name=직책명)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;
    
    // 정렬 기준 컬럼
    @IsOptional()
    @IsEnum( JobTitleSortBy )
    sortBy: JobTitleSortBy = JobTitleSortBy.SORT_ORDER;

    // 상속 order 기본값 변경 DESC->ASC
    order: SortOrder = SortOrder.ASC;
}
