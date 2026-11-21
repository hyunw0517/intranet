import { IsEmail, IsString, Length, IsOptional, IsDateString, IsNotEmpty } from 'class-validator';
import { EmptyToNull } from "src/common/decorator/empty-to-null.decorator";

export class CreateUserDto {

    /**
     * 사원번호 (로그인 아이디, 중복 불가)
     * @example "2611001"
     */
    @IsString()
    //@Length(7, 7)
    @IsNotEmpty()
    empNo: string;

    /** 이메일 (중복 불가) */
    @IsEmail()
    @IsNotEmpty()
    email: string;

    /** 비밀번호 (8~20자) */
    @IsString()
    @Length(8, 20)
    @IsNotEmpty()
    password: string;

    /** 이름 (1~30자) */
    @IsString()
    @Length(1, 30)
    @IsNotEmpty()
    name: string;

    /** 닉네임 (1~20자, 빈 문자열은 null로 저장) */
    @IsString()
    @Length(1, 20)
    @IsOptional()
    @EmptyToNull()
    nickname?: string | null;

    /**
     * 생년월일 (날짜 문자열, 빈 문자열은 null로 저장)
     * @example "1990-01-01"
     */
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    birthday?: string | null;

    /**
     * 휴대폰 번호 (10~11자, 빈 문자열은 null로 저장)
     * @example "01012345678"
     */
    @IsString()
    @Length(10, 11)
    @IsOptional()
    @EmptyToNull()
    hp?: string | null;

    /**
     * 회사 전화 (10~11자, 빈 문자열은 null로 저장)
     * @example "0212345678"
     */
    @IsString()
    @Length(10, 11)
    @IsOptional()
    @EmptyToNull()
    tel?: string | null;
}
