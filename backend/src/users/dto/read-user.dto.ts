import { IsEmail, IsString, IsOptional, IsDateString, IsInt } from 'class-validator';

export class ReadUserDto {
    @IsInt()
    id: number;

    @IsString()
    empNo: string;

    @IsEmail()
    email: string;

    @IsString()
    password: string;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    nickname?: string;

    @IsOptional()
    @IsDateString()
    birthday?: string;
    
    @IsString()
    @IsOptional()
    hp?: string;

    @IsString()
    @IsOptional()
    tel?: string;
}