import { OmitType, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateDepartmentDto } from './create-department.dto';

//* 부서 수정 DTO (name만 필수)
// PartialType의 IsOptional은 재선언해도 남아서, OmitType으로 name을 뺀 뒤 다시 선언한다
export class UpdateDepartmentDto extends PartialType(OmitType(CreateDepartmentDto, ['name'] as const)) {

    /** 부서명 (1~50자, 같은 상위 부서 안에서 중복 불가) */
    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
