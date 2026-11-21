import { PickType } from '@nestjs/swagger';
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNotEmpty, IsString, MaxLength, ValidateNested } from "class-validator";
import { ConsentType } from "src/generated/prisma/client";
import { CreateUserDto } from "src/users/dto/create-user.dto";

//* 가입 화면에서 동의한 문서 (항목 + 화면에 표시된 버전)
export class RegisterConsentDto {

    @IsEnum(ConsentType)
    type: ConsentType;

    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    version: string;
}

export class RegisterUserDto extends PickType( CreateUserDto, ['empNo', 'name', 'nickname', 'email', 'password', 'birthday', 'hp', 'tel'] ) {

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RegisterConsentDto)
    consents: RegisterConsentDto[];
}
