// 회원 관련 공통 타입 (여러 기능·화면에서 사용)
// 백엔드 Users 모델의 "JSON 응답" 기준이다. (날짜는 문자열, 비밀번호 해시는 Prisma 전역 omit으로 제외)
export type UserRole = "GUEST" | "USER" | "ADMIN" | "SUPER_ADMIN";

// 관리자 기능 (백엔드 enum AdminPermission) - ADMIN은 지정된 기능만, SUPER_ADMIN은 전부
export type AdminPermission =
  | "USERS"
  | "ORGANIZATION"
  | "BOARDS"
  | "FACILITIES"
  | "RESERVATIONS"
  | "APPROVAL_LINES"
  | "LEAVES";

// 화면 표시 순서 = 관리자 메뉴 순서
export const ADMIN_PERMISSION_LABEL: Record<AdminPermission, string> = {
  USERS: "회원 관리",
  ORGANIZATION: "조직 관리",
  BOARDS: "게시판 관리",
  FACILITIES: "시설 관리",
  RESERVATIONS: "예약 관리",
  APPROVAL_LINES: "결재라인 권한 관리",
  LEAVES: "연차 관리",
};
export const ADMIN_PERMISSIONS = Object.keys(ADMIN_PERMISSION_LABEL) as AdminPermission[];
export type UserStatus = "ACTIVE" | "INACTIVE" | "RESIGNED";

// 화면 표시용 권한 이름 (헤더 사용자 메뉴, 마이페이지, 관리자 회원 목록 등에서 공용)
export const ROLE_LABEL: Record<UserRole, string> = {
  GUEST: "승인 대기",
  USER: "직원",
  ADMIN: "관리자",
  SUPER_ADMIN: "슈퍼관리자",
};

// 화면 표시용 계정 상태 이름 (재직만 로그인 가능, 백엔드 checkUserStatus 기준)
export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "재직",
  INACTIVE: "비활성",
  RESIGNED: "퇴사",
};

// GET /users/me 응답 (화면에서 쓰는 필드만 정의)
export interface CurrentUser {
  id: number;
  empNo: string;
  email: string;
  name: string;
  nickname: string | null;
  birthday: string | null; // ISO 문자열 (DATE 컬럼)
  hp: string | null;
  tel: string | null;
  joinAt: string | null;
  role: UserRole;
  adminPermissions: AdminPermission[]; // ADMIN만 값이 있다
  status: UserStatus;
  positionId: number | null;
  createdAt: string;
  updatedAt: string;
}
