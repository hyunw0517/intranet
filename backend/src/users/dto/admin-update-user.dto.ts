import { OmitType } from '@nestjs/mapped-types';
import { IsDateString, IsOptional } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { CreateUserDto } from './create-user.dto';

//* (관리자) 회원 정보 수정 DTO
// 가입 정보에서 비밀번호를 제외하고 입사일을 추가 (비밀번호는 초기화 API로만 변경)
export class AdminUpdateUserDto extends OmitType(CreateUserDto, ['password'] as const) {

    // 입사일 (연차 계산에 사용)
    @IsDateString()
    @IsOptional()
    @EmptyToNull()
    joinAt?: string | null;

}
