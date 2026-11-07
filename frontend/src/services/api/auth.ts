// 백엔드 auth.controller 대응 (/auth/*)
import { apiFetch } from "@/services/api-client";

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

// PATCH /auth/change/pw (ChangePasswordDto)
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Basic 인증 값: base64("사번:비밀번호")
// btoa는 Latin1만 처리하므로 UTF-8 바이트로 바꾼 뒤 인코딩한다. (백엔드는 utf8로 디코딩)
function toBasicToken(empNo: string, password: string) {
  const bytes = new TextEncoder().encode(`${empNo}:${password}`);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// 로그인 → { accessToken } + refresh 쿠키(Set-Cookie)
export function login(empNo: string, password: string) {
  return apiFetch<TokenResponse>("/auth/login/emp", {
    method: "POST",
    skipAuth: true,
    headers: { Authorization: `Basic ${toBasicToken(empNo, password)}` },
  });
}

// 회원가입 → 가입 즉시 GUEST로 로그인 (토큰 + 쿠키 발급)
export function register(input: RegisterInput) {
  return apiFetch<TokenResponse>("/auth/register/emp", {
    method: "POST",
    skipAuth: true,
    body: input,
  });
}

// 로그아웃 → refresh 쿠키 삭제 + 서버가 이 기기의 세션만 폐기 (다른 기기는 유지)
export function logout() {
  return apiFetch<boolean>("/auth/logout", { method: "POST", skipAuth: true });
}

// 비밀번호 변경 → 기존 토큰은 tokenVersion으로 모두 무효화되고, 새 access token + 새 refresh 쿠키가 온다.
export function changePassword(input: ChangePasswordInput) {
  return apiFetch<TokenResponse>("/auth/change/pw", { method: "PATCH", body: input });
}

// (관리자) 비밀번호 초기화 → 서버가 만든 임시 비밀번호를 응답으로 한 번만 돌려준다. (대상 회원의 기존 로그인은 해제)
export function resetPassword(userId: number) {
  return apiFetch<{ temporaryPassword: string }>(`/auth/reset/pw/${userId}`, { method: "PATCH" });
}
