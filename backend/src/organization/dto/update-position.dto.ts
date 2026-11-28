import { OmitType, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreatePositionDto } from './create-position.dto';

//* 직급 수정 DTO (name만 필수)
// PartialType의 IsOptional은 재선언해도 남아서, OmitType으로 name을 뺀 뒤 다시 선언한다
export class UpdatePositionDto extends PartialType(OmitType(CreatePositionDto, ['name'] as const)) {

    /** 직급명 (1~50자, 중복 불가) */
    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
