import { IsEmail, IsString, IsOptional, IsDateString, IsNumber } from 'class-validator';

export class ReadUserDto {
    @IsNumber()
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
}