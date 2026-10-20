import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateDepartmentDto } from './create-department.dto';

//* 부서 수정 DTO (name은 필수, 나머지 필드는 선택, 검증 규칙은 CreateDepartmentDto와 동일)
// PartialType이 붙이는 IsOptional은 재선언해도 상속되어 남으므로, OmitType으로 name을 제외한 뒤 다시 선언
export class UpdateDepartmentDto extends PartialType(OmitType(CreateDepartmentDto, ['name'] as const)) {

    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
