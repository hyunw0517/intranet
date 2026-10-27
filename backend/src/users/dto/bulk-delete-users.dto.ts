import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

//* (관리자) 회원 일괄 삭제 DTO
export class BulkDeleteUsersDto {

    // 삭제할 회원 id 목록 (중복·본인 포함 여부는 서비스에서 검증)
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ids: number[];

}
