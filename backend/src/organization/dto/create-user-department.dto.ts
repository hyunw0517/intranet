import { IsInt, IsOptional } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';

//* 회원 소속 입력 기준 DTO 
export class CreateUserDepartmentDto {

    // 부서 id
    @IsInt()
    departmentId: number;

    // 직책 id (직책이 없는 팀원은 NULL)
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    jobTitleId?: number | null;

}
