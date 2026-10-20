import { IsOptional, IsString, MaxLength } from 'class-validator';

//* 직책 목록 조회 필터 (GET query string)
export class PaginateJobTitleQueryDto {

    // 직책명 (?name=직책명)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

}
