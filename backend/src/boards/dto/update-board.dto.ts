import { OmitType, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateBoardDto } from './create-board.dto';

//* 게시판 수정 DTO (name만 필수)
// PartialType의 IsOptional은 재선언해도 남아서, OmitType으로 name을 뺀 뒤 다시 선언한다
export class UpdateBoardDto extends PartialType(OmitType(CreateBoardDto, ['name'] as const)) {

    /** 게시판명 (1~100자, 같은 상위 게시판 안에서 중복 불가) */
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    name: string;

}
