import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

//* 사원 검색 (?search= 이름·사번·부서명, 이름순 고정)
export class DirectoryQueryDto extends PagePaginationDto {

    /** 검색어 (이름·사번·부서명 부분 일치, 겸직 부서 포함) */
    @IsString()
    @MaxLength(50)
    @IsOptional()
    search?: string;
}
