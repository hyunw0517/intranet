// 백엔드 Users 모델 기준 (GET /users/me 응답, 비밀번호 해시는 Prisma 전역 omit으로 제외됨)
export type UserRole = "GUEST" | "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE" | "RESIGNED";

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

export interface TokenResponse {
  accessToken: string;
}

// POST /auth/register/emp (RegisterUserDto)
export interface RegisterInput {
  empNo: string;
  email: string;
  password: string;
  name: string;
  nickname?: string;
  birthday?: string;
  hp?: string;
  tel?: string;
}

// PATCH /users/me (UpdateUserDto) - 수정하려면 현재 비밀번호로 본인 확인
export interface UpdateMeInput {
  email: string;
  currentPassword: string;
  name: string;
  nickname: string;
  birthday: string;
  hp: string;
  tel: string;
}

// PATCH /auth/change/pw (ChangePasswordDto)
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
