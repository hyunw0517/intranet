import { IsDate, IsEnum, IsInt, IsOptional } from 'class-validator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';
import { StringToDate } from 'src/common/decorator/string-to-date.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { FacilityReservationStatus } from 'src/generated/prisma/client';

//* 내 예약 목록 (?status=&from=&to=&page=&take=&order=) - 시작 시각 정렬 (기본 최신순)
// from·to: 시작 시각이 [from, to)인 예약 (둘 다 선택)
export class MyReservationListQueryDto extends PagePaginationDto {

    @IsEnum( FacilityReservationStatus )
    @IsOptional()
    status?: FacilityReservationStatus;

    @StringToDate()
    @IsDate()
    @IsOptional()
    from?: Date;

    @StringToDate()
    @IsDate()
    @IsOptional()
    to?: Date;
}

//* 전체 예약 목록 (관리자) - 내 예약 필터 + 시설·예약자
export class AdminReservationListQueryDto extends MyReservationListQueryDto {

    @StringToNumber()
    @IsInt()
    @IsOptional()
    facilityId?: number;

    @StringToNumber()
    @IsInt()
    @IsOptional()
    userId?: number;
}
