import { PickType } from "@nestjs/mapped-types";
import { CreateUserDto } from "src/users/dto/create-user.dto";

export class RegisterUserDto extends PickType( CreateUserDto, ['empNo', 'name', 'nickname', 'email', 'password', 'birthday', 'hp', 'tel'] ) {}

