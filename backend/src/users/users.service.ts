import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { UserRole, Users } from 'src/generated/prisma/client';
import { PaginateUserQueryDto } from './dto/paginate-user-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PageArgs, PageResult } from 'src/common/util/pagination.util';

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
    
    const where = {
      deleted: ( query.deletedOnly === true ) ? true : false, // 삭제 회원 조회 true 플래그가 있다면 삭제된 회원만 표시
      empNo: query.empNo ? { contains: query.empNo } : undefined,
      email: query.email ? { contains: query.email } : undefined,
      name: query.name ? { contains: query.name } : undefined,
      nickname: query.nickname ? { contains: query.nickname } : undefined,
      role: query.role, 
      status: query.status,
    };

    // 목록과 전체 개수 조회 -> Promise.all로 병렬 처리
    const [result, total] = await Promise.all([
      // list
      this.prisma.users.findMany({
        select: {
          id: true,
          empNo: true, 
          email: true, 
          name: true, 
          nickname: true, 
          birthday: true,
          status: true,
          role: true,
          deletedAt: true, // 삭제된 회원 조회(deletedOnly) 시 삭제 시각

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
              isPrimary: ( query.allDepartments === true ) ? undefined : true, // 전체 소속 조회 true 플래그가 없다면 대표 소속만 표시
            },
            orderBy: [
              // orderBy 배열 이유: Prisma는 orderBy 객체 하나에 필드가 정확히 1개만 있어야 함
              { isPrimary: 'desc' }, //1순위(대표 지정 소속)
              { createdAt: 'asc' } //2순위(등록순)
            ], 
          },
        },

        where,
        orderBy: [
          { [query.sortBy]: query.order },
          { id: query.order }
        ],
        ...PageArgs( query ),
      }),
      // total
      this.prisma.users.count({ where })
    ]);

    return PageResult( result, total, query );
  }

  //* (관리자) 회원 상세 조회
  // - 개인정보(hp, tel, birthday)를 포함하므로 관리자 API에서만 사용한다.
  async getUserDetail(userId: number) {
    const user = await this.prisma.users.findFirst({
      select: {
        id: true,
        empNo: true,
        email: true,
        name: true,
        nickname: true,
        birthday: true,
        hp: true,
        tel: true,
        joinAt: true,
        role: true,
        status: true,
        createdAt: true,

        // 직급
        position: {
          select: {
            id: true,
            name: true,
          }
        },

        // 소속 (부서+직책), 대표 소속 먼저
        departments: {
          select: {
            id: true,
            isPrimary: true,
            department: { 
              select: { 
                id: true, 
                name: true 
              } 
            },
            jobTitle: { 
              select: { 
                id: true, 
                name: true 
              } 
            },
          },
          where: { deleted: false },
          orderBy: [
            { isPrimary: 'desc' },
            { createdAt: 'asc' }
          ],
        },
      },
      where: {
        id: userId,
        deleted: false,
      },
    });

    if( !user ){
      throw new BadRequestException('존재하지 않는 회원입니다.');
    }

    return user;
  }

  //* (관리자) 회원 정보 수정
  // - 본인 수정(updateUser)과 달리 현재 비밀번호 확인이 없고, 사번·입사일도 수정할 수 있다.
  async adminUpdateUser(
    userId: number,
    body: AdminUpdateUserDto,
  ) {
    await this.getUserDetail(userId);

    // 대상 회원을 제외한 다른 회원이 이미 사용 중인 이메일·사번인지 확인한다.
    const emailExists = await this.prisma.users.findFirst({
      where: {
        email: body.email,
        deleted: false,
        id: { not: userId },
      },
    });

    if( emailExists ){
      throw new BadRequestException('이미 가입된 이메일입니다.');
    }

    const empNoExists = await this.prisma.users.findFirst({
      where: {
        empNo: body.empNo,
        deleted: false,
        id: { not: userId },
      },
    });

    if( empNoExists ){
      throw new BadRequestException('이미 사용 중인 사원번호입니다.');
    }

    await this.prisma.users.update({
      where: {
        id: userId,
      },
      data: {
        empNo: body.empNo,
        email: body.email,
        name: body.name,
        nickname: body.nickname,
        hp: body.hp,
        tel: body.tel,
        // null: 값 지우기, undefined: 변경 안 함
        birthday: ( body.birthday ) ? new Date(body.birthday) : body.birthday,
        joinAt: ( body.joinAt ) ? new Date(body.joinAt) : body.joinAt,
      },
    });

    return this.getUserDetail(userId);
  }

  //* (관리자) 가입 승인 및 권한 변경
  // - GUEST -> USER/ADMIN 변경이 가입 승인이다.
  // - 승인하는 회원은 입사일이 먼저 등록되어 있어야 한다. (연차 계산에 필요, 관리자 회원 정보 수정에서 등록)
  async updateUserRole(
    user: Pick<Users, 'id'>,
    userIds: number[],
    body: UpdateUserRoleDto,
  ) {

    if( body.role === UserRole.GUEST ){
      throw new BadRequestException('GUEST 권한으로는 변경할 수 없습니다.');
    }

    const ids = await this.validateTargetUsers(user, userIds, { requireJoinAt: true });

    await this.prisma.$transaction( async (tx) => {
      const { count } = await tx.users.updateMany({
        where: {
          id: { in: ids },
          deleted: false, 
          // 입사일 없는 승인 대기 회원은 수정 대상에서 제외
          NOT: { role: UserRole.GUEST, joinAt: null },   
        }, 
        data: {
          role: body.role,
        }
      });

      if( count !== ids.length ){
        throw new BadRequestException("작업 실패. 새로고침 후 다시 시도하세요.");
      }

    });

    return true;
  }

  //* (관리자) 회원 상태 변경
  // - 가드가 요청마다 status를 확인하므로 변경 즉시 로그인·API 접근이 막힌다.
  async updateUserStatus(
    user: Pick<Users, 'id'>,
    userIds: number[],
    body: UpdateUserStatusDto,
  ) {
    
    const ids = await this.validateTargetUsers(user, userIds);

    await this.prisma.$transaction( async (tx) => {
      const { count } = await tx.users.updateMany({
        where: {
          id: { in: ids },
          deleted: false, 
        }, 
        data: {
          status: body.status,
        }
      });

      if( count !== ids.length ){
        throw new BadRequestException("작업 실패. 새로고침 후 다시 시도하세요.");
      }
    });

    return true;
  }

  //* (관리자) 회원 삭제(soft delete) - 단건은 [id], 일괄은 선택한 id 목록으로 호출한다.
  // - 모든 회원에게 같은 값을 넣으므로 updateMany 한 번으로 처리한다. (회원 수만큼 update하지 않음)
  async adminDeleteUser(
    user: Pick<Users, 'id'>,
    userIds: number[],
  ) {
    //대상 회원 검증 (본인 제외, 존재하고 삭제되지 않은 회원만)
    const ids = await this.validateTargetUsers(user, userIds);

    await this.prisma.$transaction( async (tx) => {
      const { count } = await tx.users.updateMany({
        where: {
          id: { in: ids },
          deleted: false, 
        },
        data: {
          tokenVersion: { increment: 1 },
          deleted: true,
          deletedAt: new Date(),
          deletedId: user.id,
        },
      });

      // 검증과 수정 사이에 다른 관리자가 먼저 삭제한 회원이 있으면 전체를 롤백한다.
      if( count !== ids.length ){
        throw new BadRequestException("작업 실패. 새로고침 후 다시 시도하세요.");
      }
    });

    return true;
  }

  //* (관리자) 권한·상태 변경, 삭제 대상 회원 검증 (단건·일괄 공용)
  // - 중복 id 제거 → 본인 포함 여부 → 모두 존재하고 삭제되지 않은 회원인지 확인
  // - requireJoinAt: 입사일이 없는 승인 대기(GUEST) 회원이 있으면 거부한다. (가입 승인 시 사용, 메시지에 이름 표시)
  // - 검증을 통과한 id 목록(중복 제거)을 돌려준다.
  private async validateTargetUsers(
    user: Pick<Users, 'id'>,
    userIds: number[],
    options: { requireJoinAt?: boolean } = {},
  ) {
    const ids = [ ...new Set(userIds) ];

    this.checkNotSelf(user, ids);

    const targetUsers = await this.prisma.users.findMany({
      select: { id: true, name: true, role: true, joinAt: true },
      where: {
        id: { in: ids },
        deleted: false,
      },
    });

    if( targetUsers.length !== ids.length ){
      throw new BadRequestException(
        ( ids.length === 1 ) ? '존재하지 않는 회원입니다.' : '존재하지 않거나 삭제된 회원이 포함되어 있습니다.'
      );
    }

    if( options.requireJoinAt ){
      const noJoinAtUsers = targetUsers.filter( (u) => u.role === UserRole.GUEST && !u.joinAt );

      if( noJoinAtUsers.length > 0 ){
        throw new BadRequestException(
          `입사일이 등록되지 않은 승인 대기 회원이 있습니다: ${ noJoinAtUsers.map( (u) => u.name ).join(', ') }`
        );
      }
    }

    return ids;
  }

  //* (관리자) 삭제 회원 복구
  // - 삭제된 동안 다른 회원이 같은 이메일·사번으로 가입했을 수 있으므로 중복을 확인한다.
  // - 삭제 전에 발급된 토큰이 다시 유효해지지 않도록 tokenVersion을 올린다.
  async recoveryUser(userId: number) {
    const deletedUser = await this.prisma.users.findFirst({
      where: {
        id: userId,
        deleted: true,
      },
    });

    if( !deletedUser ){
      throw new BadRequestException('삭제된 회원이 아닙니다.');
    }

    const emailExists = await this.prisma.users.findFirst({
      where: {
        email: deletedUser.email,
        deleted: false,
      },
    });

    if( emailExists ){
      throw new BadRequestException('같은 이메일을 사용 중인 회원이 있어 복구할 수 없습니다.');
    }

    const empNoExists = await this.prisma.users.findFirst({
      where: {
        empNo: deletedUser.empNo,
        deleted: false,
      },
    });

    if( empNoExists ){
      throw new BadRequestException('같은 사원번호를 사용 중인 회원이 있어 복구할 수 없습니다.');
    }

    await this.prisma.users.update({
      where: {
        id: userId,
      },
      data: {
        deleted: false,
        deletedAt: null,
        deletedId: null,
        tokenVersion: { increment: 1 },
      },
    });

    return this.getUserDetail(userId);
  }

  //* 관리자 본인을 대상으로 하는 권한·상태 변경 또는 삭제 차단
  //  - 실수로 자기 권한을 잃는 것을 방지.
  //  - 단건(userId)과 일괄(userIds 배열) 모두 받는다. 모두 배열로 바뀌면 number[]만 남긴다.
  private checkNotSelf(user: Pick<Users, 'id'>, userIds: number | number[]) {
    const ids = Array.isArray(userIds) ? userIds : [ userIds ];

    if( ids.includes(user.id) ){
      throw new BadRequestException('본인 계정의 권한·상태를 변경하거나 삭제할 수 없습니다.');
    }
  }

  //* 회원 생성
  async createUser( user: CreateUserDto ){

    // nickname은 중복을 허용하며 별도 검사를 하지 않는다.
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
  //  - 입력된 비밀번호와 사용자 정보에 저장되어 있는 hash를 비교한다.
  async verifyPassword(user: Pick<Users, 'password'>, password: string, purpose: 'login' | 'confirm' = 'confirm') {
    const passOk = await bcrypt.compare( password, user.password );

    if( !passOk ){
      // 예외처리 분리
      if( purpose === 'login' ){
        // 로그인 -> 401
        throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
      }else{
        // 비밀번호 체크 -> 400
        throw new BadRequestException('비밀번호가 일치하지 않습니다.');
      }
    }
  }

  //* 회원 개인정보 수정
  //  - 본인 확인을 위해 현재 비밀번호를 먼저 검증.
  //  - 비밀번호 변경은 별도 요청으로 처리하므로 password는 수정 대상에서 제외한다.
  async updateUser(
    user: Pick<Users, 'id'>, 
    body: UpdateUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.currentPassword, 'confirm');

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
  //  - 사용자 비밀번호 확인(정보 수정, 탈퇴, 비밀번호 변경 등)에서 사용.
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
  //  - 해시는 Auth 모듈에서 생성하고 update는 이곳에서 진행. 
  //  - tokenVersion -> 기존에 발급된 토큰을 무효화하는 용도. 
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
  //  - 회원 탈퇴
  //  - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
  async deleteUser(
    user: Pick<Users, 'id'>,
    body: DeleteUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.password, 'confirm');

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
