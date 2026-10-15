import { IsDateString, IsEmail, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";

export class UpdateUserDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    // 본인 확인용 현재 비밀번호 (변경할 비밀번호 아님)
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

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