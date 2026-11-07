import { IsEnum } from 'class-validator';
import { UserRole } from 'src/generated/prisma/client';

//* (관리자) 가입 승인 및 권한 변경 DTO
export class UpdateUserRoleDto {

    // 변경할 권한 (GUEST로 되돌리는 것은 서비스에서 막음)
    @IsEnum(UserRole)
    role: UserRole;

}
