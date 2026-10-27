import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { UpdateUserRoleDto } from './update-user-role.dto';

//* (관리자) 가입 승인 및 권한 변경 DTO
export class BulkUpdateUsersRoleDto extends UpdateUserRoleDto {

    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
