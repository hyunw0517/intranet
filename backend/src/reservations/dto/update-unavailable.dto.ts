import { PartialType } from '@nestjs/mapped-types';
import { CreateUnavailableDto } from './create-unavailable.dto';

//* 사용 불가 기간 수정 (보낸 항목만)
export class UpdateUnavailableDto extends PartialType( CreateUnavailableDto ) {}
