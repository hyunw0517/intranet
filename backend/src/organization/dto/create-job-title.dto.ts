import { IsNotEmpty, IsString, Length } from 'class-validator';

//* 직책 입력 기준 DTO (Update 등은 이 클래스에서 파생)
export class CreateJobTitleDto {

    /** 직책명 (1~50자, 중복 불가) */
    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
