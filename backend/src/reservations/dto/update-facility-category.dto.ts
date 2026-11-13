import { PartialType } from '@nestjs/mapped-types';
import { CreateFacilityCategoryDto } from './create-facility-category.dto';

//* 시설 분류 수정 (보낸 항목만) - 규칙을 바꿔도 이미 있는 예약은 그대로 두고 새 예약부터 적용한다.
export class UpdateFacilityCategoryDto extends PartialType( CreateFacilityCategoryDto ) {}
