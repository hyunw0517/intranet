// 백엔드 users.controller 대응 (/users/*)
import { apiFetch } from "@/services/api-client";
import type { CurrentUser } from "@/types/user";

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

export function fetchMe() {
  return apiFetch<CurrentUser>("/users/me");
}

export function updateMe(input: UpdateMeInput) {
  return apiFetch<CurrentUser>("/users/me", { method: "PATCH", body: input });
}
