import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt } from 'class-validator';
import { MAX_BULK_RESERVATIONS } from '../const/reservation.const';

//* 예약 일괄 처리 (취소·삭제·시간 변경)
export class ReservationIdsDto {

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( MAX_BULK_RESERVATIONS )
    @ArrayUnique()
    @IsInt({ each: true })
    ids: number[];
}
