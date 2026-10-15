import { IsEmail, IsString, Length, IsOptional, IsDateString, IsNotEmpty } from 'class-validator';
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";

export class CreateUserDto {

    @IsString()
    //@Length(7, 7)
    @IsNotEmpty()
    empNo: string;

    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @Length(8, 20)
    @IsNotEmpty()
    password: string;

    @IsString()
    @Length(1, 30)
    @IsNotEmpty()
    name: string;

    @IsString()
    @Length(1, 20)
    @IsOptional()
    @EmptyToNull()
    nickname?: string | null;

    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    birthday?: string | null;
    
    @IsString()
    @Length(10, 11)
    @IsOptional()
    @EmptyToNull()
    hp?: string | null;

    @IsString()
    @Length(10, 11)
    @IsOptional()
    @EmptyToNull()
    tel?: string | null;
}