import { PartialType } from '@nestjs/swagger';
import { CreateFacilityCategoryDto } from './create-facility-category.dto';

//* 시설 분류 수정 (보낸 항목만, 바뀐 규칙은 새 예약부터 적용)
export class UpdateFacilityCategoryDto extends PartialType( CreateFacilityCategoryDto ) {}
