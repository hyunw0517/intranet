import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { EmptyToNull } from 'src/common/decorator/empty-to-null.decorator';
import { PagePaginationDto } from 'src/common/dto/page-pagination.dto';

// 사업자등록번호는 숫자만 저장한다(하이픈 등 표시 형식은 화면이 맡는다). "123-45-67890"과 "1234567890"이 같은 번호로 중복 검사되도록.
const digitsOnly = ({ value }: { value: unknown }) => typeof value === 'string' ? value.replace( /[^0-9]/g, '' ) : value;

//* 거래처 등록 (USER 이상 누구나)
export class CreateProjectClientDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    name: string;

    // 사업자등록번호 (선택, 숫자 10자리)
    @Transform( digitsOnly )
    @Matches( /^\d{10}$/, { message: '사업자등록번호는 숫자 10자리입니다.' } )
    @IsOptional()
    @EmptyToNull()
    businessNo?: string | null;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    ceoName?: string | null;

    @IsString()
    @MaxLength(200)
    @IsOptional()
    @EmptyToNull()
    address?: string | null;

    @IsString()
    @MaxLength(20)
    @IsOptional()
    @EmptyToNull()
    tel?: string | null;

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;
}

//* 거래처 수정 (보낸 항목만, USER 이상 누구나)
export class UpdateProjectClientDto extends PartialType( CreateProjectClientDto ) {}

//* 거래처 목록 (?search= 회사명·사업자번호)
export class ProjectClientListQueryDto extends PagePaginationDto {

    @IsString()
    @MaxLength(100)
    @IsOptional()
    search?: string;
}

//* 거래처 담당자 등록
export class CreateProjectClientContactDto {

    @IsString()
    @IsNotEmpty()
    @Length(1, 50)
    name: string;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    department?: string | null;

    @IsString()
    @MaxLength(50)
    @IsOptional()
    @EmptyToNull()
    jobTitle?: string | null;

    @IsString()
    @MaxLength(20)
    @IsOptional()
    @EmptyToNull()
    hp?: string | null;

    @IsEmail()
    @MaxLength(100)
    @IsOptional()
    @EmptyToNull()
    email?: string | null;

    @IsString()
    @MaxLength(1000)
    @IsOptional()
    @EmptyToNull()
    memo?: string | null;
}

//* 거래처 담당자 수정 (보낸 항목만)
export class UpdateProjectClientContactDto extends PartialType( CreateProjectClientContactDto ) {}
