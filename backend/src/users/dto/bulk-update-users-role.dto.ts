import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { UpdateUserRoleDto } from './update-user-role.dto';

//* (관리자) 회원 권한 일괄 변경 DTO
export class BulkUpdateUsersRoleDto extends UpdateUserRoleDto {

    @IsArray()
    @ArrayMaxSize(200)
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
