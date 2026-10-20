import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { Users } from 'src/generated/prisma/client';
import { PaginateUserQueryDto } from './dto/paginate-user-query.dto';

@Injectable()
export class UsersService {
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ){}
  
  //* 전체 회원 조회
  async paginateUser( 
    query: PaginateUserQueryDto, 
  ) {
    return await this.prisma.users.findMany({
      select: {
        empNo: true, 
        email: true, 
        name: true, 
        nickname: true, 
        birthday: true,
        status: true,
        role: true,

        // 직급
        position: { 
            select: { 
                id: true, 
                name: true, 
            } 
        },

        // 소속 (부서+직책)
        departments: {
            select: {
                id: true,
                isPrimary: true,
                // 부서
                department: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                // 직책
                jobTitle: {
                    select: {
                        id: true,
                        name: true,
                    } 
                },
            },
            where: { 
              deleted: false, 
              isPrimary: ( query.allDepartments === true ) ? false : true, // 대표 소속만 표시
            },
            orderBy: [
                // orderBy 배열 이유: Prisma는 orderBy 객체 하나에 필드가 정확히 1개만 있어야 함
                { isPrimary: 'desc' }, //1순위(대표 지정 소속)
                { createdAt: 'asc' } //2순위(등록순)
            ], 
        },
      },

      where: {
        deleted: false,
        empNo: query.empNo ? { contains: query.empNo } : undefined,
        email: query.email ? { contains: query.email } : undefined,
        name: query.name ? { contains: query.name } : undefined,
        nickname: query.nickname ? { contains: query.nickname } : undefined,
      },
      orderBy: [
        { createdAt: 'asc' }, 
        { id: 'asc' }
      ],
    });
  }

  //* 회원 생성
  async createUser( user: CreateUserDto ){

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
        hp: user.hp,
        tel: user.tel,
      },
    });

    return newUser;
  }

  //* 비밀번호 확인
  //      - 입력된 비밀번호와 사용자 정보에 저장되어 있는 hash를 비교한다.
  async verifyPassword(user: Pick<Users, 'password'>, password: string) {
    const passOk = await bcrypt.compare( password, user.password );

    if( !passOk ){
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }
  }

  //* 회원 개인정보 수정
  //      - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
  //      - 비밀번호 변경은 별도 요청으로 처리하므로 password는 수정 대상에서 제외한다.
  async updateUser(
    user: Pick<Users, 'id'>, 
    body: UpdateUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.currentPassword);

    // 본인을 제외한 다른 회원이 이미 사용 중인 이메일인지 확인한다.
    const emailExists = await this.prisma.users.findFirst({
      where: {
        email: body.email,
        deleted: false,
        id: { not: user.id },
      },
    });

    if( emailExists ){
      throw new BadRequestException('이미 가입된 이메일입니다.');
    }

    return await this.prisma.users.update({
      where: {
        id: user.id,
      },
      data: {
        email: body.email,
        name: body.name,
        nickname: body.nickname,
        hp: body.hp,
        tel: body.tel,
        // null: 값 지우기, undefined: 변경 안 함
        birthday: ( body.birthday ) ? new Date(body.birthday) : body.birthday,
        updatedAt: new Date(),
      },
      omit: {
        password: true,
      },
    });
  }

  //* 이메일로 회원 조회
  async getUserByEmail(email: string){
    return await this.prisma.users.findFirst({
      where: {
        email,
        deleted: false,
      },
    });
  }
  
  //* 사원번호로 회원 조회
  async getUserByEmpNo(empNo: string){
    return await this.prisma.users.findFirst({
      where: {
        empNo,
        deleted: false,
      },
    });
  }

  //* 사원번호로 회원 조회 (비밀번호 해시 포함)
  //      - prisma 모듈 전역 설정으로 password는 기본 제외되므로, 로그인 검증에서만 명시적으로 포함.
  async getUserWithPasswordByEmpNo(empNo: string){
    return await this.prisma.users.findFirst({
      where: {
        empNo,
        deleted: false,
      },
      omit: {
        password: false,
      },
    });
  }

  //* 비밀번호 해시 조회
  //      - 로그인한 사용자의 비밀번호 확인(정보 수정, 탈퇴, 비밀번호 변경)에서 사용.
  async getPasswordHashById(id: number){
    const user = await this.prisma.users.findFirst({
      where: {
        id,
        deleted: false,
      },
      select: {
        password: true,
      },
    });

    if( !user ){
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    return user.password;
  }

  //* 비밀번호 변경
  //      - 해시는 AuthService에서 생성하고, 여기서는 저장만 한다.
  //      - tokenVersion을 올려 기존에 발급된 토큰을 모두 무효화한다.
  async updatePassword(id: number, hash: string){
    return await this.prisma.users.update({
      where: {
        id,
      },
      data: {
        password: hash,
        tokenVersion: { increment: 1 },
        updatedAt: new Date(),
      },
      select: {
        id: true,
        empNo: true,
        tokenVersion: true,
      },
    });
  }

  //* 회원 삭제 (soft delete)
  //      - 로그인한 본인 계정만 삭제한다.
  //      - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
  //      - 실제로 행을 지우지 않고 deleted 플래그와 삭제 시각, 삭제자 id를 기록한다.
  async deleteUser(
    user: Pick<Users, 'id'>,
    body: DeleteUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.password);

    await this.prisma.users.update({
      where: {
        id: user.id,
      },
      data: {
        deleted: true,
        deletedAt: new Date(),
        deletedId: user.id,
      },
    });

    return true;
  }

}
