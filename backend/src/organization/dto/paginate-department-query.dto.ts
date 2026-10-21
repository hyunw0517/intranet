import { IsOptional, IsString, MaxLength } from 'class-validator';

//* 부서 목록 조회 필터 (GET query string)
// 부서는 트리 구조이고 개수가 적어 페이지네이션 없이 전체를 반환한다.
export class PaginateDepartmentQueryDto {

    // 부서명 (?name=부서명) - 경로(상위 부서명 포함) 기준 검색
    @IsString()
    @MaxLength(50)
    @IsOptional()
    name?: string;

}
