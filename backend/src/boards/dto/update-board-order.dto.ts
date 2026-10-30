import { IsInt, IsOptional } from 'class-validator';
import { UpdateSortOrderDto } from 'src/organization/dto/update-sort-order.dto';

//* 게시판 순서 변경 DTO - 같은 상위 게시판 아래의 형제 게시판끼리만 순서를 바꾼다.
export class UpdateBoardOrderDto extends UpdateSortOrderDto {

    // 상위 게시판 id (최상위끼리 정렬할 때는 NULL 또는 생략)
    @IsInt()
    @IsOptional()
    parentBoardId?: number | null;

}
