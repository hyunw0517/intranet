import { apiFetch } from "@/services/api-client";
import type {
  ChangePasswordInput,
  CurrentUser,
  RegisterInput,
  TokenResponse,
  UpdateMeInput,
} from "./types";

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

// 로그아웃 → refresh 쿠키 삭제
export function logout() {
  return apiFetch<boolean>("/auth/logout", { method: "POST", skipAuth: true });
}

export function fetchMe() {
  return apiFetch<CurrentUser>("/users/me");
}

export function updateMe(input: UpdateMeInput) {
  return apiFetch<CurrentUser>("/users/me", { method: "PATCH", body: input });
}

// 비밀번호 변경 → 기존 토큰은 tokenVersion으로 모두 무효화되고, 새 access token + 새 refresh 쿠키가 온다.
export function changePassword(input: ChangePasswordInput) {
  return apiFetch<TokenResponse>("/auth/change/pw", { method: "PATCH", body: input });
}
