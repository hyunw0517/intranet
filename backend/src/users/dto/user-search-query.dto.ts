import { IsOptional, IsString, MaxLength } from 'class-validator';

//* 공용 회원 검색 (?search= 이름·사번·부서명)
export class UserSearchQueryDto {

    @IsString()
    @MaxLength(50)
    @IsOptional()
    search?: string;
}
