import { IsOptional, IsString, MaxLength } from 'class-validator';

//* 직급 목록 조회 필터 (GET query string)
export class PaginatePositionQueryDto {

    // 직급명 (?name=직급명)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

}
