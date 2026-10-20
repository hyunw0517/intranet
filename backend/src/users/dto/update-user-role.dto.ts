import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { UserRole } from 'src/generated/prisma/client';

//* (관리자) 가입 승인 및 권한 변경 DTO
export class UpdateUserRoleDto {

    // 변경할 권한 (GUEST로 되돌리는 것은 서비스에서 막음)
    @IsEnum(UserRole)
    role: UserRole;

    // 입사일 (GUEST 승인 시 입사일이 없으면 필수)
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    joinAt?: string | null;

}
