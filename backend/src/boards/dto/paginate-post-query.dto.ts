import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

//* 정렬 가능 컬럼
export enum PostSortBy {
    CREATED_AT = 'createdAt',
    LIKE_COUNT = 'likeCount',
    VIEW_COUNT = 'viewCount',
}

//* 게시글 목록 조회 DTO (GET query string)
export class PaginatePostQueryDto extends PagePaginationDto {

    // 게시글 제목 검색
    @IsOptional()
    @IsString()
    title?: string;
    
    // 게시글 내용 검색
    @IsOptional()
    @IsString()
    content?: string;
    
    // 게시글 작성자 검색
    @IsOptional()
    @IsString()
    author?: string;
    
    // 정렬 기준 컬럼
    @IsOptional()
    @IsEnum( PostSortBy )
    sortBy: PostSortBy = PostSortBy.CREATED_AT;

}
