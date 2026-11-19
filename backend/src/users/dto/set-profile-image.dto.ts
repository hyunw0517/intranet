import { IsInt, IsPositive } from "class-validator";

export class SetProfileImageDto {
    // POST /common/files/images로 먼저 올린 이미지의 id (내가 올린 미연결 이미지만 연결된다)
    @IsInt()
    @IsPositive()
    fileId: number;
}
