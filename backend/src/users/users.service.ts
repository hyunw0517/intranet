import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AdminPermission, AuditActionType, AuditTargetType, ConsentAction, ConsentType, FileTargetType, Prisma, UserRole, Users, UserStatus } from 'src/generated/prisma/client';
import { CURRENT_CONSENT_VERSIONS } from './const/consent.const';
import { PaginateUserQueryDto, UserSortBy } from './dto/paginate-user-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { PaginatePage } from 'src/common/util/pagination.util';
import { SortOrder } from 'src/common/dto/base-pagination.dto';
import { AuditService, TargetAudit } from 'src/common/audit.service';
import { batchChanges, diffChanges } from 'src/common/util/audit-detail.util';
import { UserNotifier } from './user-notifier';
import { isAdminRole } from 'src/auth/util/admin-permission.util';
import { FilesService } from 'src/common/files.service';
import { FileKind } from 'src/common/const/file.const';

//* 감사 로그용 회원 표시: 이름(사번)
const userLabel = ( user: Pick<Users, 'name' | 'empNo'> ) => `${user.name}(${user.empNo})`;

// 작업하는 관리자 (token payload)
type ActorUser = Pick<Users, 'id' | 'role'>;

@Injectable()
export class UsersService {

  private readonly audit: TargetAudit;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    auditService: AuditService,
    private readonly userNotifier: UserNotifier,
    private readonly filesService: FilesService,
  ){
    this.audit = auditService.target( AuditTargetType.USER );
  }
  
  //* 전체 회원 조회
  async paginateUser(
    query: PaginateUserQueryDto,
  ) {
    
    const where: Prisma.UsersWhereInput = {
      deleted: query.deletedOnly === true,
      empNo: query.empNo ? { contains: query.empNo } : undefined,
      email: query.email ? { contains: query.email, mode: 'insensitive' } : undefined,
      name: query.name ? { contains: query.name, mode: 'insensitive' } : undefined,
      nickname: query.nickname ? { contains: query.nickname, mode: 'insensitive' } : undefined,
      role: query.role, 
      status: query.status,
      positionId: query.positionId,
      // 부서·직책 조건은 같은 소속 안에서 함께 맞아야 한다 (예: 개발팀의 팀장)
      departments: ( query.departmentName || query.jobTitleId ) ? {
        some: {
          deleted: false,
          department: query.departmentName ? { name: { contains: query.departmentName, mode: 'insensitive' } } : undefined,
          jobTitleId: query.jobTitleId,
        },
      } : undefined,
    };

    // 소속(1:N)은 Prisma orderBy로 정렬할 수 없어서 따로 처리
    if ( query.sortBy === UserSortBy.DEPARTMENT ) {
      return this.paginateUserByDepartment( where, query );
    }

    return PaginatePage( 
      query,
      // list
      (page) => this.prisma.users.findMany({
        select: this.userListSelect( query ),
        where,
        orderBy: [
          this.userOrderBy( query ),
          { id: query.order }
        ],
        ...page,
      }),
      // total
      () => this.prisma.users.count({ where }),
    );
  }

  //* (관리자) 회원 현황 건수
  // 잠금 건수에서 없는 사번으로 시도한 기록(userId NULL)은 뺀다.
  async getUserStats() {
    const approved = { deleted: false, role: { not: UserRole.GUEST } };

    const [ pending, active, inactive, locked ] = await Promise.all([
      this.prisma.users.count({ where: { deleted: false, role: UserRole.GUEST, status: UserStatus.ACTIVE } }),
      this.prisma.users.count({ where: { ...approved, status: UserStatus.ACTIVE } }),
      this.prisma.users.count({ where: { ...approved, status: UserStatus.INACTIVE } }),
      this.prisma.loginHistory.count({ where: { userId: { not: null }, lockedUntil: { gt: new Date() } } }),
    ]);

    return { pending, active, inactive, locked };
  }

  //* 회원 목록 select
  private userListSelect( query: PaginateUserQueryDto ) {
    return {
      id: true,
      empNo: true,
      email: true,
      name: true,
      nickname: true,
      birthday: true,
      status: true,
      role: true,
      deletedAt: true,

      position: {
        select: {
          id: true,
          name: true,
        }
      },

      departments: {
        select: {
          id: true,
          isPrimary: true,
          department: {
            select: {
              id: true,
              name: true,
            }
          },
          jobTitle: {
            select: {
              id: true,
              name: true,
            } 
          },
        },
        where: { 
          deleted: false, 
          isPrimary: ( query.allDepartments === true ) ? undefined : true, // 기본은 대표 소속만
        },
        // 대표 소속 먼저, 그다음 등록순
        orderBy: [
          { isPrimary: 'desc' },
          { createdAt: 'asc' }
        ],
      },
    } satisfies Prisma.UsersSelect;
  }

  //* 목록 정렬 조건
  private userOrderBy( query: PaginateUserQueryDto ): Prisma.UsersOrderByWithRelationInput {
    switch ( query.sortBy ) {
      case UserSortBy.EMP_NO:
        return { empNo: query.order };
      case UserSortBy.NAME:
        return { name: query.order };
      case UserSortBy.POSITION:
        // 직급 이름이 아니라 순위로 정렬. 직급이 없으면 NULL이라 오름차순일 때 맨 뒤에 온다.
        return { position: { sortOrder: query.order } };
      default:
        return { createdAt: query.order };
    }
  }

  //* 대표 부서명 정렬 조회
  // id와 부서명만 전부 읽어 메모리에서 정렬한 뒤 해당 페이지만 다시 조회한다.
  // 사내 회원 수로는 충분하고, 많아지면 raw SQL로 바꾼다.
  private async paginateUserByDepartment(
    where: Prisma.UsersWhereInput,
    query: PaginateUserQueryDto,
  ) {
    const rows = await this.prisma.users.findMany({
      select: {
        id: true,
        departments: {
          select: { department: { select: { name: true } } },
          where: { deleted: false, isPrimary: true },
        },
      },
      where,
    });

    // 부서명, 같으면 id 순. 대표 소속이 없으면 항상 맨 뒤
    const direction = ( query.order === SortOrder.ASC ) ? 1 : -1;
    const sorted = rows
      .map( (row) => ({ id: row.id, departmentName: row.departments[0]?.department.name ?? null }) )
      .sort( (a, b) => {
        if ( a.departmentName === b.departmentName ) return ( a.id - b.id ) * direction;
        if ( a.departmentName === null ) return 1;
        if ( b.departmentName === null ) return -1;
        return a.departmentName.localeCompare( b.departmentName, 'ko' ) * direction;
      });

    return PaginatePage( query,
      // list
      async ({ skip, take }) => {
        const pageIds = sorted.slice( skip, skip + take ).map( (row) => row.id );

        const users = await this.prisma.users.findMany({
          select: this.userListSelect( query ),
          where: { id: { in: pageIds } },
        });

        // IN 조회는 순서를 보장하지 않아 다시 맞춘다
        const userById = new Map( users.map( (user) => [user.id, user] ) );
        return pageIds
          .map( (id) => userById.get(id) )
          .filter( (user) => user !== undefined );
      },
      // total
      () => Promise.resolve( sorted.length ),
    );
  }

  //* (관리자) 회원 상세 조회
  // 연락처·생일이 들어 있어 관리자 API에서만 쓴다.
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
        adminPermissions: true, // ADMIN만 값이 있음
        status: true,
        createdAt: true,

        position: {
          select: {
            id: true,
            name: true,
          }
        },

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

    // 로그인 잠금 상태 (잠금 해제 버튼 표시용)
    // AuthModule이 UsersModule을 import하고 있어서 auth 쪽 서비스를 쓰지 않고 테이블을 직접 읽는다.
    const loginHistory = await this.prisma.loginHistory.findUnique({
      select: { failCount: true, lockLevel: true, lockedUntil: true },
      where: { empNo: user.empNo },
    });

    return {
      ...user,
      loginLock: loginHistory && {
        ...loginHistory,
        isLocked: !!loginHistory.lockedUntil && loginHistory.lockedUntil > new Date(),
      },
    };
  }

  //* (관리자) 회원 정보 수정
  // 본인 수정과 달리 비밀번호 확인 없이 사번·입사일까지 바꿀 수 있다.
  async adminUpdateUser(
    userId: number,
    body: AdminUpdateUserDto,
  ) {
    const targetUser = await this.getUserDetail(userId);

    // 승인된 회원은 입사일이 있어야 한다 (연차 계산)
    if( targetUser.role !== UserRole.GUEST && body.joinAt === null ){
      throw new BadRequestException('승인된 회원은 입사일을 비울 수 없습니다.');
    }

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

    const data = {
      empNo: body.empNo,
      email: body.email,
      name: body.name,
      nickname: body.nickname,
      hp: body.hp,
      tel: body.tel,
      // null: 값 지우기, undefined: 변경 안 함
      birthday: ( body.birthday ) ? new Date(body.birthday) : body.birthday,
      joinAt: ( body.joinAt ) ? new Date(body.joinAt) : body.joinAt,
    };

    await this.prisma.$transaction( async (tx) => {
      await tx.users.update({
        where: {
          id: userId,
        },
        data,
      });

      await this.audit.updated( tx, userId, `(관리자) 회원 정보 수정: ${ userLabel(targetUser) }`, diffChanges( targetUser, data ) );
    });

    return this.getUserDetail(userId);
  }

  //* (관리자) 가입 승인 및 권한 변경
  // GUEST에서 바꾸는 것이 가입 승인이고, 승인하려면 입사일이 있어야 한다.
  // ADMIN은 USER로만 바꿀 수 있다. 관리자 지정과 관리자 기능 지정은 슈퍼관리자만 한다.
  // 관리자 권한이 줄면 tokenVersion을 올려 재발급을 막는다. 이미 받은 access token은 만료(최대 10분)까지 쓸 수 있다.
  async updateUserRole(
    user: ActorUser,
    userIds: number[],
    body: UpdateUserRoleDto,
  ) {

    if( body.role === UserRole.GUEST ){
      throw new BadRequestException('GUEST 권한으로는 변경할 수 없습니다.');
    }

    if( body.adminPermissions && body.role !== UserRole.ADMIN ){
      throw new BadRequestException('관리자 기능은 ADMIN 권한에만 지정할 수 있습니다.');
    }

    if( user.role !== UserRole.SUPER_ADMIN && ( body.role !== UserRole.USER || body.adminPermissions ) ){
      throw new ForbiddenException('관리자 지정과 관리자 기능 지정은 슈퍼관리자만 할 수 있습니다.');
    }

    const { ids, targetUsers } = await this.validateTargetUsers(user, userIds, { requireJoinAt: true });

    // 이번에 가입 승인되는 회원
    const approvedUsers = targetUsers.filter( (u) => u.role === UserRole.GUEST );

    // ADMIN이면 보낸 기능 목록으로 바꾸고(생략하면 유지), 다른 권한이면 비운다
    const nextPermissions = ( body.role === UserRole.ADMIN )
      ? ( body.adminPermissions ? [ ...new Set(body.adminPermissions) ] : undefined )
      : [];

    const revokedIds = targetUsers
      .filter( (u) => this.isAdminAccessReduced(u, body.role, nextPermissions) )
      .map( (u) => u.id );

    await this.prisma.$transaction( async (tx) => {
      if( body.role !== UserRole.SUPER_ADMIN ){
        await this.assertSuperAdminRemains( tx, targetUsers.filter( (u) => u.role === UserRole.SUPER_ADMIN ).map( (u) => u.id ) );
      }

      const { count } = await tx.users.updateMany({
        where: {
          id: { in: ids },
          deleted: false,
          // 검사 뒤에 입사일이 지워진 GUEST는 빼서 아래 count 검사에 걸리게 한다
          NOT: { role: UserRole.GUEST, joinAt: null },
        },
        data: {
          role: body.role,
          adminPermissions: nextPermissions, // undefined면 바꾸지 않음
        }
      });

      if( count !== ids.length ){
        throw new BadRequestException("작업 실패. 새로고침 후 다시 시도하세요.");
      }

      if( revokedIds.length > 0 ){
        await tx.users.updateMany({
          where: { id: { in: revokedIds } },
          data: { tokenVersion: { increment: 1 } },
        });
      }

      const permissionText = ( body.role === UserRole.ADMIN && nextPermissions )
        ? ` [기능: ${ nextPermissions.join(', ') || '없음' }]`
        : '';

      await this.audit.logBatch({
        targetIds: ids,
        actionType: AuditActionType.ROLE_CHANGE,
        content: ( approvedUsers.length > 0 )
          ? `권한 변경 → ${body.role}${permissionText} (가입 승인 ${approvedUsers.length}명): ${ targetUsers.map(userLabel).join(', ') }`
          : `권한 변경 → ${body.role}${permissionText}: ${ targetUsers.map(userLabel).join(', ') }`,
        changes: {
          ...batchChanges( targetUsers, 'role', body.role ),
          ...( nextPermissions ? batchChanges( targetUsers, 'adminPermissions', nextPermissions ) : {} ),
        },
      }, tx);

    });

    // 커밋 후 가입 승인 알림 (실패해도 권한 변경은 성공)
    await this.userNotifier.signupApproved( approvedUsers.map( (u) => u.id ) );

    return true;
  }

  //* (관리자) 회원 상태 변경
  async updateUserStatus(
    user: ActorUser,
    userIds: number[],
    body: UpdateUserStatusDto,
  ) {

    const { ids, targetUsers } = await this.validateTargetUsers(user, userIds);

    await this.prisma.$transaction( async (tx) => {
      if( body.status !== UserStatus.ACTIVE ){
        await this.assertSuperAdminRemains( tx, targetUsers.filter( (u) => u.role === UserRole.SUPER_ADMIN ).map( (u) => u.id ) );
      }

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

      await this.audit.logBatch({
        targetIds: ids,
        actionType: AuditActionType.STATUS_CHANGE,
        content: `상태 변경 → ${body.status}: ${ targetUsers.map(userLabel).join(', ') }`,
        changes: batchChanges( targetUsers, 'status', body.status ),
      }, tx);
    });

    return true;
  }

  //* (관리자) 회원 삭제 (soft delete, 단건·일괄 공용)
  async adminDeleteUser(
    user: ActorUser,
    userIds: number[],
  ) {
    const { ids, targetUsers } = await this.validateTargetUsers(user, userIds);

    await this.prisma.$transaction( async (tx) => {
      await this.assertSuperAdminRemains( tx, targetUsers.filter( (u) => u.role === UserRole.SUPER_ADMIN ).map( (u) => u.id ) );

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

      // 검사 뒤 다른 관리자가 먼저 삭제했으면 전체 롤백
      if( count !== ids.length ){
        throw new BadRequestException("작업 실패. 새로고침 후 다시 시도하세요.");
      }

      await this.audit.logBatch({
        targetIds: ids,
        actionType: AuditActionType.DELETE,
        content: `(관리자) 회원 삭제: ${ targetUsers.map(userLabel).join(', ') }`,
      }, tx);
    });

    return true;
  }

  //* 권한·상태 변경, 삭제 대상 검사 (단건·일괄 공용)
  // 대상 회원의 변경 전 값을 같이 돌려준다. 감사 로그와 가입 승인 알림에 쓴다.
  private async validateTargetUsers(
    user: ActorUser,
    userIds: number[],
    options: { requireJoinAt?: boolean } = {},
  ) {
    const ids = [ ...new Set(userIds) ];

    this.checkNotSelf(user, ids);

    const targetUsers = await this.prisma.users.findMany({
      select: { id: true, empNo: true, name: true, role: true, adminPermissions: true, status: true, joinAt: true },
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

    targetUsers.forEach( (target) => this.assertCanManageAccount(user, target) );

    if( options.requireJoinAt ){
      const noJoinAtUsers = targetUsers.filter( (u) => u.role === UserRole.GUEST && !u.joinAt );

      if( noJoinAtUsers.length > 0 ){
        throw new BadRequestException(
          `입사일이 등록되지 않은 승인 대기 회원이 있습니다: ${ noJoinAtUsers.map( (u) => u.name ).join(', ') }`
        );
      }
    }

    return { ids, targetUsers };
  }

  //* (관리자) 삭제 회원 복구
  // 삭제된 동안 같은 이메일·사번으로 가입한 회원이 있을 수 있다.
  // 삭제 전에 받은 토큰이 다시 살아나지 않게 tokenVersion을 올린다.
  async recoveryUser(user: ActorUser, userId: number) {
    const deletedUser = await this.prisma.users.findFirst({
      where: {
        id: userId,
        deleted: true,
      },
    });

    if( !deletedUser ){
      throw new BadRequestException('삭제된 회원이 아닙니다.');
    }

    // 삭제된 관리자 계정을 되살리는 것도 관리자 계정 작업이다.
    this.assertCanManageAccount(user, deletedUser);

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

    await this.prisma.$transaction( async (tx) => {
      await tx.users.update({
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

      await this.audit.log({ targetId: userId, actionType: AuditActionType.RESTORE, content: `회원 복구: ${ userLabel(deletedUser) }` }, tx);
    });

    return this.getUserDetail(userId);
  }

  //* 본인 계정 변경·삭제 차단 (실수로 자기 권한을 잃지 않게)
  private checkNotSelf(user: Pick<Users, 'id'>, userIds: number | number[]) {
    const ids = Array.isArray(userIds) ? userIds : [ userIds ];

    if( ids.includes(user.id) ){
      throw new BadRequestException('본인 계정의 권한·상태를 변경하거나 삭제할 수 없습니다.');
    }
  }

  //* 관리자 계정은 슈퍼관리자만 관리
  // AuthService의 비밀번호 초기화·잠금 해제에서도 쓴다.
  assertCanManageAccount( user: Pick<Users, 'role'>, target: Pick<Users, 'role' | 'name'> ){
    if( isAdminRole(target.role) && user.role !== UserRole.SUPER_ADMIN ){
      throw new ForbiddenException(`관리자 계정(${target.name})은 슈퍼관리자만 변경할 수 있습니다.`);
    }
  }

  //* 마지막 슈퍼관리자 보호
  // 둘이 동시에 서로를 강등하면 0명이 될 수 있어서 행을 잠그고 센다.
  private async assertSuperAdminRemains( tx: Prisma.TransactionClient, removingIds: number[] ){
    if( removingIds.length === 0 ){
      return;
    }

    const superAdmins = await tx.$queryRaw<{ id: number; status: UserStatus }[]>`
      SELECT id, status FROM users_model
      WHERE role = 'SUPER_ADMIN' AND deleted = false
      FOR UPDATE
    `;

    const remaining = superAdmins.filter( (u) => u.status === UserStatus.ACTIVE && !removingIds.includes(u.id) );

    if( remaining.length === 0 ){
      throw new BadRequestException('마지막 슈퍼관리자는 강등·정지·삭제할 수 없습니다.');
    }
  }

  //* 관리자 권한이 줄어드는지 (강등, 관리자 기능 해제)
  private isAdminAccessReduced(
    target: Pick<Users, 'role' | 'adminPermissions'>,
    nextRole: UserRole,
    nextPermissions: AdminPermission[] | undefined,
  ): boolean {
    if( target.role === UserRole.SUPER_ADMIN ){
      return nextRole !== UserRole.SUPER_ADMIN;
    }

    if( target.role === UserRole.ADMIN ){
      if( nextRole === UserRole.SUPER_ADMIN ) return false;
      if( nextRole !== UserRole.ADMIN ) return true;
      return !!nextPermissions && target.adminPermissions.some( (p) => !nextPermissions.includes(p) );
    }

    return false;
  }

  //* 회원 생성
  async createUser( user: CreateUserDto ){

    // nickname은 중복 허용
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

    const newUser = await this.prisma.$transaction( async (tx) => {
      const newUser = await tx.users.create({
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

      // 동의 이력 (필수 동의 검사는 AuthService에서 끝남)
      await tx.userConsent.createMany({
        data: ( Object.entries(CURRENT_CONSENT_VERSIONS) as [ConsentType, string][] ).map( ([type, version]) => ({
          userId: newUser.id,
          type,
          action: ConsentAction.AGREE,
          version,
        }) ),
      });

      // 로그인 전 요청이라 작업자를 가입한 회원으로 남긴다
      await this.audit.log({ targetId: newUser.id, actionType: AuditActionType.CREATE, content: `회원가입: ${ userLabel(newUser) }`, actorId: newUser.id }, tx);

      return newUser;
    });

    // 커밋 후 관리자에게 승인 대기 알림 (실패해도 가입은 성공)
    await this.userNotifier.signupRequested( newUser );

    return newUser;
  }

  //* 비밀번호 재확인 (정보 수정·탈퇴·비밀번호 변경)
  // 로그인 검증은 AuthService가 따로 한다.
  async verifyPassword(user: Pick<Users, 'password'>, password: string) {
    const passOk = await bcrypt.compare( password, user.password );

    if( !passOk ){
      throw new BadRequestException('비밀번호가 일치하지 않습니다.');
    }
  }

  //* 내 정보 수정 (비밀번호 변경은 별도 API)
  async updateUser(
    user: Pick<Users, 'id'>,
    body: UpdateUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.currentPassword);

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

    const data = {
      email: body.email,
      name: body.name,
      nickname: body.nickname,
      hp: body.hp,
      tel: body.tel,
      // null: 값 지우기, undefined: 변경 안 함
      birthday: ( body.birthday ) ? new Date(body.birthday) : body.birthday,
    };

    const updated = await this.prisma.$transaction( async (tx) => {
      const before = await tx.users.findUniqueOrThrow({
        where: { id: user.id },
      });

      const updatedUser = await tx.users.update({
        where: {
          id: user.id,
        },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        omit: {
          password: true,
        },
      });

      await this.audit.updated( tx, user.id, `내 정보 수정: ${ userLabel(before) }`, diffChanges( before, data ) );

      return updatedUser;
    });

    // 화면이 이 응답으로 현재 사용자를 갱신해서 GET /users/me와 같은 모양으로 준다
    return { ...updated, profileImageUrl: await this.profileImageUrl( user.id ) };
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

  //* 비밀번호 변경 (해시는 AuthService에서 만든다)
  // tokenVersion을 올려 기존 토큰을 무효화한다.
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
        role: true, // 새 access token에 넣을 권한
        adminPermissions: true,
        tokenVersion: true,
      },
    });
  }

  //* 모든 기기 로그아웃 (tokenVersion 증가)
  // 지금 기기에는 새 토큰을 주기 위해 바뀐 값을 돌려준다.
  async increaseTokenVersion(id: number) {
    return await this.prisma.users.update({
      where: {
        id,
      },
      data: {
        tokenVersion: { increment: 1 },
      },
      select: {
        id: true,
        empNo: true,
        role: true, // 새 access token에 넣을 권한
        adminPermissions: true,
        tokenVersion: true,
      },
    });
  }

  //* 내 정보 조회
  // 가드는 DB를 보지 않아서 회원 정보는 여기서 읽는다. 비밀번호는 전역 omit으로 빠진다.
  async getMyInfo(id: number){
    const user = await this.prisma.users.findFirst({
      where: {
        id,
        deleted: false,
      },
    });

    if( !user ){
      throw new UnauthorizedException('존재하지 않는 사용자입니다.');
    }

    return { ...user, profileImageUrl: await this.profileImageUrl( id ) };
  }

  //* 프로필 사진 주소 (없으면 null)
  private async profileImageUrl( userId: number ){
    return ( await this.filesService.findProfileImageUrls( [ userId ] ) ).get( userId ) ?? null;
  }

  //* 프로필 사진 등록·변경
  // 먼저 올린 이미지(POST /common/files/images)를 연결하고, 기존 사진은 지운다.
  async setMyProfileImage( userId: number, fileId: number ){
    await this.syncMyProfileImage( userId, [ fileId ], '프로필 사진 변경' );
    return this.getMyInfo( userId );
  }

  //* 프로필 사진 삭제 (사진이 없어도 성공)
  async deleteMyProfileImage( userId: number ){
    await this.syncMyProfileImage( userId, [], '프로필 사진 삭제' );
    return this.getMyInfo( userId );
  }

  //* 프로필 사진 연결 + 감사 로그
  private async syncMyProfileImage( userId: number, fileIds: number[], action: string ){
    await this.prisma.$transaction( async (tx) => {
      const before = await tx.files.findFirst({
        select: { id: true },
        where: { targetType: FileTargetType.USER_PROFILE, targetId: userId, deleted: false },
      });

      await this.filesService.syncTargetFiles( tx, {
        kind: FileKind.IMAGE,
        targetType: FileTargetType.USER_PROFILE,
        targetId: userId,
        fileIds,
        userId,
      });

      const user = await tx.users.findUniqueOrThrow({ where: { id: userId }, select: { name: true, empNo: true } });
      await this.audit.updated( tx, userId, `${action}: ${ userLabel(user) }`, {
        profileImageFileId: { before: before?.id ?? null, after: fileIds[0] ?? null },
      });
    });
  }

  //* 회원 탈퇴 (soft delete)
  async deleteUser(
    user: Pick<Users, 'id'>,
    body: DeleteUserDto,
  ) {
    const hash = await this.getPasswordHashById(user.id);
    await this.verifyPassword({ password: hash }, body.password);

    await this.prisma.$transaction( async (tx) => {
      const deletedUser = await tx.users.update({
        where: {
          id: user.id,
        },
        data: {
          deleted: true,
          deletedAt: new Date(),
          deletedId: user.id,
        },
      });

      await this.audit.deleted( tx, user.id, `회원 탈퇴: ${ userLabel(deletedUser) }` );
    });

    return true;
  }

}
