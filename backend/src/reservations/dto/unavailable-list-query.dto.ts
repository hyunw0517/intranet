import { IsDate, IsOptional } from 'class-validator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';

//* 사용 불가 기간 목록 (관리자) - from·to: 기간이 [from, to)와 겹치는 것 (둘 다 선택), 시작 시각 정렬
export class UnavailableListQueryDto extends PagePaginationDto {

    @StringToDate()
    @IsDate()
    @IsOptional()
    from?: Date;

    @StringToDate()
    @IsDate()
    @IsOptional()
    to?: Date;
}
