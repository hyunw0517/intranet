import { IsInt, IsOptional } from 'class-validator';
import { UpdateSortOrderDto } from './update-sort-order.dto';

//* 부서 순서 변경 DTO - 같은 상위 부서 아래의 형제 부서끼리만 순서를 바꾼다.
export class UpdateDepartmentOrderDto extends UpdateSortOrderDto {

    // 상위 부서 id (최상위 부서끼리 정렬할 때는 NULL 또는 생략)
    @IsInt()
    @IsOptional()
    parentDepartmentId?: number | null;

}
