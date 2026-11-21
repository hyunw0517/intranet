import { OmitType, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateBoardDto } from './create-board.dto';

//* 게시판 수정 DTO (name은 필수, 나머지 필드는 선택, 검증 규칙은 CreateBoardDto와 동일)
// PartialType이 붙이는 IsOptional은 재선언해도 상속되어 남으므로, OmitType으로 name을 제외한 뒤 다시 선언
export class UpdateBoardDto extends PartialType(OmitType(CreateBoardDto, ['name'] as const)) {

    /** 게시판명 (1~100자, 같은 상위 게시판 안에서 중복 불가) */
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    name: string;

}
