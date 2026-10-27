import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { UpdateUserStatusDto } from './update-user-status.dto';

//* (관리자) 가입 승인 및 권한 변경 DTO
export class BulkUpdateUsersStatusDto extends UpdateUserStatusDto {

    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
