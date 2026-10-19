import { IsInt, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';

//* 부서 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreateDepartmentDto {

    // 상위 부서 id (최상위 부서는 NULL)
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    parentDepartmentId?: number | null;

    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
