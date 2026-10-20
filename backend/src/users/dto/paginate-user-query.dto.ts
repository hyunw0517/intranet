import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { StringToBoolean } from 'src/common/decorator/string-to-boolean.decorator';

export class PaginateUserQueryDto {

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

}