import { ApiProperty } from '@nestjs/swagger';
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

    /** 직책명 (?name=직책명) */
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;
    
    /** 정렬 기준 컬럼 */
    @ApiProperty({ enum: JobTitleSortBy, enumName: 'JobTitleSortBy', required: false, default: JobTitleSortBy.SORT_ORDER })
    @IsOptional()
    @IsEnum( JobTitleSortBy )
    sortBy: JobTitleSortBy = JobTitleSortBy.SORT_ORDER;

    /** 정렬 방향 (이 목록은 기본 오름차순, 상속받은 기본값 DESC를 바꾼다) */
    @ApiProperty({ enum: SortOrder, enumName: 'SortOrder', required: false, default: SortOrder.ASC })
    order: SortOrder = SortOrder.ASC;
}
