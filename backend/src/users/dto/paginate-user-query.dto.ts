import { IsString, IsOptional, IsBoolean, IsEnum, IsInt } from 'class-validator';
import { StringToBoolean } from 'src/common/decorator/string-to-boolean.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';
import { UserRole, UserStatus } from 'src/generated/prisma/client';

//* 정렬 가능 컬럼
export enum UserSortBy {
    CREATED_AT = 'createdAt',
    EMP_NO = 'empNo',
    NAME = 'name',
    DEPARTMENT = 'department', // 대표 소속 부서명
    POSITION = 'position',     // 직급 순위 (Position.sortOrder)
}

//* 회원 목록 조회 DTO (GET query string)
export class PaginateUserQueryDto extends PagePaginationDto {

    @IsOptional()
    @IsString()
    empNo?: string;

    @IsOptional()
    @IsString()
    email?: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    nickname?: string;

    // 부서명 검색 (겸직 포함, 소속 중 하나라도 부분 일치)
    @IsOptional()
    @IsString()
    departmentName?: string;

    @IsOptional()
    @IsBoolean()
    @StringToBoolean()
    allDepartments?: boolean;

    // true면 관리자 삭제(deleted)된 회원만 조회 (복구 대상 확인용)
    @IsOptional()
    @IsBoolean()
    @StringToBoolean()
    deletedOnly?: boolean;
    
    // 정렬 기준 컬럼
    @IsOptional()
    @IsEnum( UserSortBy )
    sortBy: UserSortBy = UserSortBy.CREATED_AT;

    // 회원 권한 필터
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    // 계정 상태 필터
    @IsOptional()
    @IsEnum(UserStatus)
    status?: UserStatus;

    // 직급 필터
    @IsOptional()
    @StringToNumber()
    @IsInt()
    positionId?: number;

    // 직책 필터 (겸직 포함, 소속 중 하나라도 해당 직책)
    @IsOptional()
    @StringToNumber()
    @IsInt()
    jobTitleId?: number;
}
