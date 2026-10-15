import { IsNotEmpty, IsString, Length } from "class-validator";

export class ChangePasswordDto {
    // 본인 확인용 현재 비밀번호
    @IsString()
    @IsNotEmpty()
    currentPassword: string;

    // 변경할 비밀번호 (회원가입과 같은 규칙)
    @IsString()
    @Length(8, 20)
    @IsNotEmpty()
    newPassword: string;
}
