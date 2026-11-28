import { Matches } from 'class-validator';
import { HM_REGEX } from './create-facility-category.dto';
import { ReservationIdsDto } from './reservation-ids.dto';

//* 예약 일괄 시간 변경
// 날짜는 그대로 두고 시작·종료 시각(KST)만 같은 시간대로 맞춘다.
export class BulkReservationTimeDto extends ReservationIdsDto {

    @Matches( HM_REGEX, { message: 'startTime은 HH:mm 형식이어야 합니다.' } )
    startTime: string;

    @Matches( HM_REGEX, { message: 'endTime은 HH:mm 형식이어야 합니다.' } )
    endTime: string;
}
