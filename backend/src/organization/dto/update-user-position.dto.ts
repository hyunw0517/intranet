import { IsInt, IsOptional } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';

//* 회원 직급 지정 DTO
export class UpdateUserPositionDto {

    // 직급 id (null이면 직급 해제)
    @IsInt()
    @IsOptional()
    @EmptyToNull()
    positionId?: number | null;

}
