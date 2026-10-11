import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  
  constructor(
      private readonly prisma: PrismaService
  ){}

  // 회원 생성
  async createUser( user: Pick<CreateUserDto, 'empNo' | 'name' | 'nickname' | 'email' | 'password' | 'birthday'> ){
    // nickname은 표시 이름(display name)이므로 중복을 허용하며 별도 검사를 하지 않는다.
    // exist() -> 만약 조건에 해당하는 값이 있으면 true 반환
    const emailExists = await this.prisma.users.findFirst({
        where: {
          email: user.email, 
          deleted: false, 
        }
    });
    
    if( emailExists ){
        throw new BadRequestException('이미 가입된 이메일입니다.');
    }
    
    const empNoExists = await this.prisma.users.findFirst({
        where: {
          empNo: user.empNo, 
          deleted: false, 
        }
    });

    if( empNoExists ){
        throw new BadRequestException('이미 사용 중인 사원번호입니다.');
    }

    const newUser = await this.prisma.users.create({
      data: {
        empNo: user.empNo,
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        password: user.password,
        birthday: ( user.birthday ) ? new Date(user.birthday) : null,
      },
    });

    return newUser;
  }

  // 전체 회원 조회
  async getAllUsers() {
    return await this.prisma.users.findMany();
  }

  // 이메일로 회원 조회
  async getUserByEmail(email: string){
    return await this.prisma.users.findFirst({
      where: {
        email,
        deleted: false,
      },
    });
  }
  
  // 사원번호로 회원 조회
  async getUserByEmpNo(empNo: string){
    return await this.prisma.users.findFirst({
      where: {
        empNo,
        deleted: false,
      },
    });
  }

}
