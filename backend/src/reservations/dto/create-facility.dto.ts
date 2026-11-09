import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { StringToBoolean } from 'src/common/decorator/string-to-boolean.decorator';
import { StringToNumber } from 'src/common/decorator/string-to-number.decorator';

//* 시설 생성 (관리자)
export class CreateFacilityDto {

    @StringToNumber()
    @IsInt()
    categoryId: number;

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    name: string;

    @IsString()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    location?: string | null;

    // 최대 인원 (회의실 등, 없으면 NULL)
    @StringToNumber()
    @IsInt()
    @Min(1)
    @Max(10000)
    @IsOptional()
    @EmptyToNull()
    capacity?: number | null;

    @IsString()
    @MaxLength(500)
    @IsOptional()
    @EmptyToNull()
    description?: string | null;

    // 사용 여부 (false면 새 예약을 받지 않는다. 기존 예약은 유지)
    @StringToBoolean()
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
