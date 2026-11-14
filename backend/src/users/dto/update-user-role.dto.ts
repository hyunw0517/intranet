import { ArrayMaxSize, IsArray, IsEnum, IsOptional } from 'class-validator';
import { AdminPermission, UserRole } from 'src/generated/prisma/client';

//* (관리자) 가입 승인 및 권한 변경 DTO
export class UpdateUserRoleDto {

    // 변경할 권한 (GUEST로 되돌리는 것은 서비스에서 막음)
    // - ADMIN·SUPER_ADMIN으로 바꾸거나 ADMIN·SUPER_ADMIN을 바꾸는 것은 슈퍼관리자만 (서비스에서 확인)
    @IsEnum(UserRole)
    role: UserRole;

    // 관리자 기능 (role이 ADMIN일 때만 보낼 수 있음, 슈퍼관리자만)
    // - 생략: 지금 값 유지 (새로 ADMIN이 되는 회원은 빈 배열에서 시작)
    // - 보냄: 이 목록으로 바꾼다
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsEnum(AdminPermission, { each: true })
    adminPermissions?: AdminPermission[];

}
