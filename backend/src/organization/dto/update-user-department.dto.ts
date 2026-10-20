import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDepartmentDto } from './create-user-department.dto';

//* 회원 소속 수정 DTO 
export class UpdateUserDepartmentDto extends PartialType(CreateUserDepartmentDto) {}
