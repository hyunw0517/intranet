import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

//* (관리자) 회원 일괄 삭제 DTO
export class BulkDeleteUsersDto {

    @IsArray()
    @ArrayMaxSize(200)
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
