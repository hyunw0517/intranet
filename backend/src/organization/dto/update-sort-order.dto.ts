import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

//* 순서 변경 DTO (직급·직책 공용, 부서는 이 클래스에서 파생)
// 화면에 보이는 최종 순서대로 id 전체를 보낸다. 서버는 배열의 위치(0, 1, 2...)를 sortOrder로 저장한다.
export class UpdateSortOrderDto {

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(100)
    @IsInt({ each: true })
    ids: number[];

}
