import { ApiProperty } from '@nestjs/swagger';
import { PageMetaResponse } from 'src/common/dto/page-meta-response.dto';
import { AdminPermission, UserRole, UserStatus } from 'src/generated/prisma/client';

//* users 응답 (Swagger 문서용 클래스)
// 서비스는 Prisma 결과를 그대로 돌려주고, 컨트롤러 반환 타입에 이 클래스를 적어 typecheck로 필드를 맞춘다.

/** id + 이름 (직급·부서·직책) */
export class NamedRefResponse {
    id: number;
    name: string;
}

/** 소속 하나 (부서 + 직책) */
export class UserDepartmentResponse {
    /** 소속 id (UserDepartment) */
    id: number;

    /** 대표 소속인지 */
    isPrimary: boolean;

    department: NamedRefResponse;

    /** 직책 (없으면 null) */
    jobTitle: NamedRefResponse | null;
}

/** 내 정보 (GET /users/me). 프로필 사진 등록·삭제, 내 정보 수정도 같은 형태로 응답한다. */
export class MyInfoResponse {
    id: number;

    /** 사원번호 */
    empNo: string;

    email: string;

    name: string;

    nickname: string | null;

    /** 생년월일 (날짜만 저장, 응답은 ISO 문자열) */
    birthday: Date | null;

    /** 휴대폰 번호 */
    hp: string | null;

    /** 회사 전화 */
    tel: string | null;

    /** 입사일 (연차 계산에 사용, 승인 전 회원은 null일 수 있다) */
    joinAt: Date | null;

    @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
    role: UserRole;

    /** 관리자 기능 (ADMIN만 값이 있다) */
    @ApiProperty({ enum: AdminPermission, enumName: 'AdminPermission', isArray: true })
    adminPermissions: AdminPermission[];

    @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
    status: UserStatus;

    /** 토큰 버전 (올라가면 기존 토큰이 모두 무효) */
    tokenVersion: number;

    /** 직급 id (지정 전이면 null) */
    positionId: number | null;

    createdAt: Date;

    updatedAt: Date;

    deleted: boolean;

    deletedAt: Date | null;

    deletedId: number | null;

    /** 프로필 사진 썸네일 공개 주소 (없으면 null) */
    profileImageUrl: string | null;
}

/** (관리자) 회원 목록 한 행 */
export class UserListItemResponse {
    id: number;

    empNo: string;

    email: string;

    name: string;

    nickname: string | null;

    birthday: Date | null;

    @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
    status: UserStatus;

    @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
    role: UserRole;

    /** 삭제 시각 (deletedOnly 조회에서 쓴다, 삭제되지 않았으면 null) */
    deletedAt: Date | null;

    /** 직급 (지정 전이면 null) */
    position: NamedRefResponse | null;

    /** 소속 목록 (기본은 대표 소속만, allDepartments=true면 전체. 대표 소속 → 등록순) */
    departments: UserDepartmentResponse[];
}

/** (관리자) 회원 목록 */
export class UserListResponse {
    data: UserListItemResponse[];

    meta: PageMetaResponse;
}

/** 로그인 실패·잠금 상태 */
export class LoginLockResponse {
    /** 현재 단계에서 연속 실패 횟수 */
    failCount: number;

    /** 잠금 단계 (0: 아직 잠긴 적 없음) */
    lockLevel: number;

    /** 이 시각까지 로그인 거부 (잠긴 적 없으면 null) */
    lockedUntil: Date | null;

    /** 지금 잠겨 있는지 */
    isLocked: boolean;
}

/** (관리자) 회원 상세 */
export class UserDetailResponse {
    id: number;

    empNo: string;

    email: string;

    name: string;

    nickname: string | null;

    birthday: Date | null;

    hp: string | null;

    tel: string | null;

    joinAt: Date | null;

    @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
    role: UserRole;

    /** 관리자 기능 (ADMIN만 값이 있다) */
    @ApiProperty({ enum: AdminPermission, enumName: 'AdminPermission', isArray: true })
    adminPermissions: AdminPermission[];

    @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
    status: UserStatus;

    createdAt: Date;

    position: NamedRefResponse | null;

    /** 소속 전체 (대표 소속 → 등록순) */
    departments: UserDepartmentResponse[];

    /** 로그인 실패 기록 (기록이 없으면 null) */
    loginLock: LoginLockResponse | null;
}

/** (관리자) 회원 현황 건수 (대시보드) */
export class UserStatsResponse {
    /** 가입 승인 대기 (GUEST, 재직) */
    pending: number;

    /** 재직 중인 승인 회원 */
    active: number;

    /** 비활성 승인 회원 */
    inactive: number;

    /** 지금 로그인이 잠긴 회원 (없는 사번의 시도는 제외) */
    locked: number;
}

/** 공용 회원 검색 결과 한 명 (다른 회원에게 보여도 되는 정보만) */
export class UserSearchItemResponse {
    id: number;

    name: string;

    empNo: string;

    /** 대표 소속 부서명 */
    departmentName: string | null;

    /** 직급명 */
    positionName: string | null;

    /** 대표 소속의 직책명 */
    jobTitleName: string | null;
}
