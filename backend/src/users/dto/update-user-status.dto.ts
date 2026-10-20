import { IsEnum } from 'class-validator';
import { UserStatus } from 'src/generated/prisma/client';

//* (관리자) 회원 상태 변경 DTO
export class UpdateUserStatusDto {

    // 재직(ACTIVE) / 휴직·잠금(INACTIVE) / 퇴사(RESIGNED)
    @IsEnum(UserStatus)
    status: UserStatus;

}
