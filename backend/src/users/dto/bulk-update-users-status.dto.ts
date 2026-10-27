import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { UpdateUserStatusDto } from './update-user-status.dto';

//* (관리자) 회원 상태 일괄 변경 DTO
export class BulkUpdateUsersStatusDto extends UpdateUserStatusDto {

    @IsArray()
    @ArrayMaxSize(200)
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
