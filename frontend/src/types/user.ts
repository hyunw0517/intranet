// 회원 관련 공통 타입 (여러 기능·화면에서 사용)
// 백엔드 Users 모델의 "JSON 응답" 기준이다. (날짜는 문자열, 비밀번호 해시는 Prisma 전역 omit으로 제외)
export type UserRole = "GUEST" | "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE" | "RESIGNED";

// 화면 표시용 권한 이름 (헤더 사용자 메뉴, 마이페이지, 관리자 회원 목록 등에서 공용)
export const ROLE_LABEL: Record<UserRole, string> = {
  GUEST: "승인 대기",
  USER: "직원",
  ADMIN: "관리자",
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
  status: UserStatus;
  positionId: number | null;
  createdAt: string;
  updatedAt: string;
}
