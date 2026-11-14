import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AdminPermission, AuditActionType, AuditTargetType, Prisma, UserRole, Users, UserStatus } from 'src/generated/prisma/client';
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

//* 감사 로그 요약에 쓰는 회원 표시 (이름(사번))
const userLabel = ( user: Pick<Users, 'name' | 'empNo'> ) => `${user.name}(${user.empNo})`;

//* 관리자 작업을 하는 회원 (access token payload의 id·role)
type ActorUser = Pick<Users, 'id' | 'role'>;

@Injectable()
export class UsersService {

  private readonly audit: TargetAudit;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    auditService: AuditService,
    private readonly userNotifier: UserNotifier,
  ){
    this.audit = auditService.target( AuditTargetType.USER );
  }
  
  //* 전체 회원 조회
  async paginateUser(
    query: PaginateUserQueryDto,
  ) {
    
    const where: Prisma.UsersWhereInput = {
      deleted: query.deletedOnly === true, // 삭제 회원 조회 true 플래그가 있다면 삭제된 회원만 표시
      empNo: query.empNo ? { contains: query.empNo } : undefined,
      email: query.email ? { contains: query.email, mode: 'insensitive' } : undefined,
      name: query.name ? { contains: query.name, mode: 'insensitive' } : undefined,
      nickname: query.nickname ? { contains: query.nickname, mode: 'insensitive' } : undefined,
      role: query.role, 
      status: query.status,
      positionId: query.positionId,
      // 부서명 검색·직책 필터: 삭제되지 않은 소속 중 하나라도 맞으면 포함 (겸직 포함)
      // 둘 다 있으면 같은 소속 행이 두 조건을 모두 만족해야 한다. (예: 개발팀의 팀장)
      departments: ( query.departmentName || query.jobTitleId ) ? {
        some: {
          deleted: false,
          department: query.departmentName ? { name: { contains: query.departmentName, mode: 'insensitive' } } : undefined,
          jobTitleId: query.jobTitleId,
        },
      } : undefined,
    };

    // 소속(1:N 관계) 정렬은 Prisma orderBy로 지정할 수 없어 따로 처리한다.
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

  //* 회원 목록 select (일반 조회·소속 정렬 조회 공용)
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
    } satisfies Prisma.UsersSelect;
  }

  //* 정렬 컬럼 → Prisma orderBy (소속 정렬은 paginateUserByDepartment에서 처리)
  private userOrderBy( query: PaginateUserQueryDto ): Prisma.UsersOrderByWithRelationInput {
    switch ( query.sortBy ) {
      case UserSortBy.EMP_NO:
        return { empNo: query.order };
      case UserSortBy.NAME:
        return { name: query.order };
      case UserSortBy.POSITION:
        // 직급은 이름이 아닌 순위(sortOrder)로 정렬한다.
        // 직급이 없는 회원은 LEFT JOIN 결과가 NULL이라 PostgreSQL 기본값대로 오름차순은 맨 뒤, 내림차순은 맨 앞에 온다.
        return { position: { sortOrder: query.order } };
      default:
        return { createdAt: query.order };
    }
  }

  //* 대표 소속 부서명 정렬 조회
  // - to-many 관계(소속)는 Prisma orderBy에서 _count 정렬만 지원해 부서명으로 정렬할 수 없다.
  // - 조건에 맞는 회원의 id와 대표 부서명만 전부 조회해 메모리에서 정렬하고, 해당 페이지의 id만 목록 데이터로 조회한다.
  // - 사내 회원 수(수백~수천 명) 기준으로는 충분하다. 규모가 커지면 raw SQL(LEFT JOIN + ORDER BY)로 바꾼다.
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

    // 대표 부서명 → id 순으로 정렬 (일반 조회의 { id: order } 보조 정렬과 같은 기준)
    // 대표 소속이 없는 회원은 정렬 방향과 관계없이 맨 뒤
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
      // list: 정렬된 id에서 해당 페이지만 잘라 조회
      async ({ skip, take }) => {
        const pageIds = sorted.slice( skip, skip + take ).map( (row) => row.id );

        const users = await this.prisma.users.findMany({
          select: this.userListSelect( query ),
          where: { id: { in: pageIds } },
        });

        // IN 조회는 순서를 보장하지 않으므로 정렬된 id 순서로 다시 맞춘다.
        const userById = new Map( users.map( (user) => [user.id, user] ) );
        return pageIds
          .map( (id) => userById.get(id) )
          .filter( (user) => user !== undefined );
      },
      // total: 이미 전체를 조회했으므로 개수만 반환
      () => Promise.resolve( sorted.length ),
    );
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
        adminPermissions: true, // 관리자 기능 (ADMIN만 값이 있음)
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

    // 로그인 잠금 상태 (관리자 화면의 "잠금 해제" 표시용, 기록이 없으면 null)
    // - LoginHistory는 인증 쪽 테이블이지만, AuthModule이 UsersModule을 import하므로 반대로 import하지 않고 직접 읽는다.
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
  // - 본인 수정(updateUser)과 달리 현재 비밀번호 확인이 없고, 사번·입사일도 수정할 수 있다.
  async adminUpdateUser(
    userId: number,
    body: AdminUpdateUserDto,
  ) {
    const targetUser = await this.getUserDetail(userId);

    // 승인된 회원(USER·ADMIN)은 입사일을 비울 수 없다. (연차 계산에 필요, 승인 시 입사일 필수 규칙과 일관)
    // - null: 비우기 요청 (빈 문자열은 EmptyToNull로 null), undefined: 변경 안 함
    if( targetUser.role !== UserRole.GUEST && body.joinAt === null ){
      throw new BadRequestException('승인된 회원은 입사일을 비울 수 없습니다.');
    }

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
  // - GUEST -> USER/ADMIN 변경이 가입 승인이다.
  // - 승인하는 회원은 입사일이 먼저 등록되어 있어야 한다. (연차 계산에 필요, 관리자 회원 정보 수정에서 등록)
  // - 회원 관리 기능을 가진 ADMIN: GUEST·USER를 USER로만 바꿀 수 있다. (가입 승인)
  //   ADMIN·SUPER_ADMIN으로 바꾸기, ADMIN·SUPER_ADMIN 회원 바꾸기, 관리자 기능 지정은 슈퍼관리자만.
  // - ADMIN이 아닌 권한으로 바뀌면 관리자 기능(adminPermissions)을 비운다.
  // - 관리자 권한이 줄어드는 회원(강등, 기능 해제)은 tokenVersion을 올려 다시 로그인하게 한다.
  //   (access token은 stateless라 남은 유효시간(최대 10분)은 막지 못하고, 그 뒤 재발급이 거부된다)
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

    // 관리자 계정(ADMIN·SUPER_ADMIN)이 대상에 있으면 슈퍼관리자만 (validateTargetUsers)
    const { ids, targetUsers } = await this.validateTargetUsers(user, userIds, { requireJoinAt: true });

    // 승인 대기(GUEST)였던 회원 = 이번에 가입 승인되는 회원
    const approvedUsers = targetUsers.filter( (u) => u.role === UserRole.GUEST );

    // ADMIN: 보낸 목록으로 바꾸거나(생략하면 유지) / 그 외 권한: 비움
    const nextPermissions = ( body.role === UserRole.ADMIN )
      ? ( body.adminPermissions ? [ ...new Set(body.adminPermissions) ] : undefined )
      : [];

    // 이번 변경으로 관리자 권한이 줄어드는 회원 → 다시 로그인
    const revokedIds = targetUsers
      .filter( (u) => this.isAdminAccessReduced(u, body.role, nextPermissions) )
      .map( (u) => u.id );

    await this.prisma.$transaction( async (tx) => {
      // 슈퍼관리자가 SUPER_ADMIN이 아닌 권한으로 바뀌면 남는 슈퍼관리자가 있는지 확인
      if( body.role !== UserRole.SUPER_ADMIN ){
        await this.assertSuperAdminRemains( tx, targetUsers.filter( (u) => u.role === UserRole.SUPER_ADMIN ).map( (u) => u.id ) );
      }

      const { count } = await tx.users.updateMany({
        where: {
          id: { in: ids },
          deleted: false,
          // 입사일 없는 승인 대기 회원은 수정 대상에서 제외
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

    // 커밋 후: 가입 승인 알림 (승인된 회원 본인에게, 실패해도 권한 변경은 성공)
    await this.userNotifier.signupApproved( approvedUsers.map( (u) => u.id ) );

    return true;
  }

  //* (관리자) 회원 상태 변경
  // - 가드가 요청마다 status를 확인하므로 변경 즉시 로그인·API 접근이 막힌다.
  // - 관리자 계정(ADMIN·SUPER_ADMIN)이 대상에 있으면 슈퍼관리자만, 마지막 재직 슈퍼관리자는 재직 외 상태로 바꿀 수 없다.
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

  //* (관리자) 회원 삭제(soft delete) - 단건은 [id], 일괄은 선택한 id 목록으로 호출한다.
  // - 모든 회원에게 같은 값을 넣으므로 updateMany 한 번으로 처리한다. (회원 수만큼 update하지 않음)
  async adminDeleteUser(
    user: ActorUser,
    userIds: number[],
  ) {
    //대상 회원 검증 (본인 제외, 존재하고 삭제되지 않은 회원만, 관리자 계정은 슈퍼관리자만)
    const { ids, targetUsers } = await this.validateTargetUsers(user, userIds);

    await this.prisma.$transaction( async (tx) => {
      // 마지막 슈퍼관리자는 삭제할 수 없다.
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

      // 검증과 수정 사이에 다른 관리자가 먼저 삭제한 회원이 있으면 전체를 롤백한다.
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

  //* (관리자) 권한·상태 변경, 삭제 대상 회원 검증 (단건·일괄 공용)
  // - 중복 id 제거 → 본인 포함 여부 → 모두 존재하고 삭제되지 않은 회원인지 → 관리자 계정이면 슈퍼관리자인지 확인
  // - requireJoinAt: 입사일이 없는 승인 대기(GUEST) 회원이 있으면 거부한다. (가입 승인 시 사용, 메시지에 이름 표시)
  // - 검증을 통과한 id 목록(중복 제거)과 대상 회원(변경 전 값 - 감사 로그·가입 승인 알림에 사용)을 돌려준다.
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
  // - 삭제된 동안 다른 회원이 같은 이메일·사번으로 가입했을 수 있으므로 중복을 확인한다.
  // - 삭제 전에 발급된 토큰이 다시 유효해지지 않도록 tokenVersion을 올린다.
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

  //* 관리자 본인을 대상으로 하는 권한·상태 변경 또는 삭제 차단
  //  - 실수로 자기 권한을 잃는 것을 방지.
  //  - 단건(userId)과 일괄(userIds 배열) 모두 받는다. 모두 배열로 바뀌면 number[]만 남긴다.
  private checkNotSelf(user: Pick<Users, 'id'>, userIds: number | number[]) {
    const ids = Array.isArray(userIds) ? userIds : [ userIds ];

    if( ids.includes(user.id) ){
      throw new BadRequestException('본인 계정의 권한·상태를 변경하거나 삭제할 수 없습니다.');
    }
  }

  //* 관리자 계정(ADMIN·SUPER_ADMIN) 보호 - 권한·상태 변경, 삭제·복구, 비밀번호 초기화, 잠금 해제는 슈퍼관리자만
  //  - 회원 관리 기능만 받은 ADMIN이 다른 관리자(슈퍼관리자 포함)를 정지·삭제하거나 비밀번호를 바꾸는 것을 막는다.
  //  - AuthService(비밀번호 초기화·잠금 해제)도 이 함수를 쓴다.
  assertCanManageAccount( user: Pick<Users, 'role'>, target: Pick<Users, 'role' | 'name'> ){
    if( isAdminRole(target.role) && user.role !== UserRole.SUPER_ADMIN ){
      throw new ForbiddenException(`관리자 계정(${target.name})은 슈퍼관리자만 변경할 수 있습니다.`);
    }
  }

  //* 마지막 슈퍼관리자 보호 - removingIds(강등·재직 외 상태·삭제될 슈퍼관리자)를 빼고 재직 중인 슈퍼관리자가 남는지 확인
  //  - 두 슈퍼관리자가 동시에 서로를 강등하면 둘 다 "상대가 남는다"고 보고 0명이 될 수 있다.
  //    그래서 슈퍼관리자 행을 FOR UPDATE로 잠근 뒤 센다. (나중 트랜잭션은 앞 트랜잭션 커밋을 기다렸다가 바뀐 값으로 센다)
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

  //* 이번 권한 변경으로 관리자 권한이 줄어드는지 (true면 tokenVersion을 올려 다시 로그인하게 한다)
  //  - SUPER_ADMIN → 그 아래 / ADMIN → USER / ADMIN의 기능이 하나라도 빠짐
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

    // 가입 + 감사 로그를 한 트랜잭션으로 (가입은 로그인 전이라 작업자를 가입한 회원으로 명시), 관리자 알림은 커밋 후
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

      // 가입은 로그인 전 요청이라 작업자를 가입한 회원으로 명시
      await this.audit.log({ targetId: newUser.id, actionType: AuditActionType.CREATE, content: `회원가입: ${ userLabel(newUser) }`, actorId: newUser.id }, tx);

      return newUser;
    });

    // 커밋 후: 승인 대기 알림 (재직 중인 관리자 전원에게, 실패해도 가입은 성공)
    await this.userNotifier.signupRequested( newUser );

    return newUser;
  }

  //* 비밀번호 확인
  //  - 입력된 비밀번호와 사용자 정보에 저장되어 있는 hash를 비교한다.
  //  - 로그인된 본인의 비밀번호 재확인(정보 수정·탈퇴·비밀번호 변경)용 → 400
  //  - 로그인 검증은 AuthService가 따로 한다. (원인을 구분하지 않는 메시지 + 실패 잠금)
  async verifyPassword(user: Pick<Users, 'password'>, password: string) {
    const passOk = await bcrypt.compare( password, user.password );

    if( !passOk ){
      throw new BadRequestException('비밀번호가 일치하지 않습니다.');
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

    const data = {
      email: body.email,
      name: body.name,
      nickname: body.nickname,
      hp: body.hp,
      tel: body.tel,
      // null: 값 지우기, undefined: 변경 안 함
      birthday: ( body.birthday ) ? new Date(body.birthday) : body.birthday,
    };

    return await this.prisma.$transaction( async (tx) => {
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
        role: true, // 새 access token에 넣을 권한
        adminPermissions: true,
        tokenVersion: true,
      },
    });
  }

  //* 토큰 버전 증가 (모든 기기에서 로그아웃)
  //  - 이 사용자에게 발급된 모든 토큰(다른 기기 포함)이 무효가 된다.
  //  - 지금 기기에 새 토큰을 발급할 수 있도록 바뀐 tokenVersion을 돌려준다.
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

  //* 내 정보 조회 (GET /users/me)
  //  - access token 검증은 DB를 보지 않으므로(req.user = payload) 회원 정보는 여기서 조회한다.
  //  - 비밀번호 해시는 Prisma 전역 omit으로 제외된다.
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

    return user;
  }

  //* 회원 삭제 (soft delete)
  //  - 회원 탈퇴
  //  - 본인 확인을 위해 현재 비밀번호를 먼저 검증한다.
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
