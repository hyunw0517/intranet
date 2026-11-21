import { PickType } from '@nestjs/swagger';
import { ReadUserDto } from "src/users/dto/read-user.dto";

export class LoginUserDto extends PickType( ReadUserDto, ['id', 'empNo', 'password'] ) {}

