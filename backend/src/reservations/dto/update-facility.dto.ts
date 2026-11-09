import { PartialType } from '@nestjs/mapped-types';
import { CreateFacilityDto } from './create-facility.dto';

//* 시설 수정 (보낸 항목만) - 분류를 옮기면 새 예약부터 옮긴 분류의 규칙을 따른다.
export class UpdateFacilityDto extends PartialType( CreateFacilityDto ) {}
