import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateBoardDto } from './create-board.dto';

//* 게시판 수정 DTO (name은 필수, 나머지 필드는 선택, 검증 규칙은 CreateBoardDto와 동일)
// PartialType이 붙이는 IsOptional은 재선언해도 상속되어 남으므로, OmitType으로 name을 제외한 뒤 다시 선언
export class UpdateBoardDto extends PartialType(OmitType(CreateBoardDto, ['name'] as const)) {

    @IsString()
    @Length(1, 50)
    @IsNotEmpty()
    name: string;

}
