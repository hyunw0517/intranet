import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateReservationDto } from './create-reservation.dto';

//* 예약 수정 (보낸 항목만) - 시설은 바꿀 수 없다. (바꾸려면 취소 후 다시 예약, 2026-11-09 사용자 결정)
// 시간을 바꾸면 분류 규칙과 겹침을 다시 확인한다.
export class UpdateReservationDto extends PartialType( OmitType( CreateReservationDto, [ 'facilityId' ] as const ) ) {}
