import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt } from 'class-validator';
import { MAX_BULK_RESERVATIONS } from '../const/reservation.const';

//* 예약 일괄 처리 (반복 예약 여러 건 취소 등)
export class ReservationIdsDto {

    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize( MAX_BULK_RESERVATIONS )
    @ArrayUnique()
    @IsInt({ each: true })
    ids: number[];
}
