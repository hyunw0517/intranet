import { IsOptional, IsString, MaxLength } from 'class-validator';

//* 부서 목록 조회 필터 (GET query string)
export class PaginateDepartmentQueryDto {

    // 부서명 (?name=부서명)
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

}
