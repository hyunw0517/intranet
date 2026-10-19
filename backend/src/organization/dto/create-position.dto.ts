import { IsInt, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';

//* 직급 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreatePositionDto {

    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
