import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { StringToBoolean } from 'src/common/decorator/string-to-boolean.decorator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';
import { UserRole, UserStatus } from 'src/generated/prisma/client';

//* 정렬 가능 컬럼
export enum UserSortBy {
    CREATED_AT = 'createdAt',
    NAME = 'name',
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
}
