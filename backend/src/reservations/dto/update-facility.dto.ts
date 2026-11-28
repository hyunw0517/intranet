import { PartialType } from '@nestjs/swagger';
import { CreateFacilityDto } from './create-facility.dto';

//* 시설 수정 (보낸 항목만, 분류를 옮기면 새 예약부터 그 규칙을 따른다)
export class UpdateFacilityDto extends PartialType( CreateFacilityDto ) {}
