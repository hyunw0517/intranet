import { ApiProperty, PickType } from '@nestjs/swagger';
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateNested } from "class-validator";
import { ConsentType } from "src/generated/prisma/client";
import { CreateUserDto } from "src/users/dto/create-user.dto";

//* 가입 화면에서 동의한 문서 (항목 + 화면에 표시된 버전)
export class RegisterConsentDto {

    /** 동의 항목 (필수 항목을 모두 보내야 한다) */
    @ApiProperty({ enum: ConsentType, enumName: 'ConsentType' })
    @IsEnum(ConsentType)
    type: ConsentType;

    /**
     * 화면에 표시된 문서 버전. 서버의 현재 버전과 다르면 400 (약관이 바뀐 경우 새로고침 후 다시 동의)
     * @example "1.0"
     */
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    version: string;
}

export class RegisterUserDto extends PickType( CreateUserDto, ['empNo', 'name', 'nickname', 'email', 'password', 'birthday', 'hp', 'tel'] ) {

    /** 동의한 문서 목록 (이용약관·개인정보 수집·이용) */
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegisterConsentDto)
    consents: RegisterConsentDto[];
}
