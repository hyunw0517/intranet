import { IsNotEmpty, IsString } from "class-validator";

export class DeleteUserDto {
    // 본인 확인용 요청자의 현재 비밀번호
    @IsString()
    @IsNotEmpty()
    password: string;
}
