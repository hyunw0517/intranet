import { ApiProperty } from '@nestjs/swagger';
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

    /** 직급명 (?name=직급명) */
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

    /** 정렬 기준 컬럼 */
    @ApiProperty({ enum: PositionSortBy, enumName: 'PositionSortBy', required: false, default: PositionSortBy.SORT_ORDER })
    @IsOptional()
    @IsEnum( PositionSortBy )
    sortBy: PositionSortBy = PositionSortBy.SORT_ORDER;

    /** 정렬 방향 (이 목록은 기본 오름차순, 상속받은 기본값 DESC를 바꾼다) */
    @ApiProperty({ enum: SortOrder, enumName: 'SortOrder', required: false, default: SortOrder.ASC })
    order: SortOrder = SortOrder.ASC;
}
