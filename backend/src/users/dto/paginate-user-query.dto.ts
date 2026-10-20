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

}