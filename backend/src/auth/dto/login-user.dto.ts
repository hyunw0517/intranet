import { PickType } from "@nestjs/mapped-types";
import { ReadUserDto } from "src/users/dto/read-user.dto";

export class LoginUserDto extends PickType( ReadUserDto, ['id', 'email', 'password'] ) {}

