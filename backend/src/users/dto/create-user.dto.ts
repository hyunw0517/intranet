import { IsEmail, IsString, Length, IsOptional, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @Length(8, 20)
    password: string;

    @IsString()
    @Length(1, 30)
    name: string;

    @IsOptional()
    @IsString()
    @Length(1, 20)
    nickname?: string;

    @Transform( ({ value }) => ( value === "" ? null : value ) )
    @IsOptional()
    @IsDateString()
    birthday?: string;
}