// 백엔드 organization.controller 대응 (/organization/*) - 회원의 직급 + 소속(부서·직책)
import { apiFetch } from "@/services/api-client";

// POST/PATCH /organization/users/:userId/departments (CreateUserDepartmentDto)
export interface UserDepartmentInput {
  departmentId: number;
  jobTitleId: number | null; // 직책이 없는 팀원은 null
}

// 직급 지정 (null이면 해제)
export function updateUserPosition(userId: number, positionId: number | null) {
  return apiFetch<unknown>(`/organization/users/${userId}/position`, { method: "PATCH", body: { positionId } });
}

// 소속 추가 - 첫 소속이면 서버가 대표 소속으로 자동 지정한다.
export function createUserDepartment(userId: number, input: UserDepartmentInput) {
  return apiFetch<unknown>(`/organization/users/${userId}/departments`, { method: "POST", body: input });
}

// 소속 수정 (부서·직책 변경)
export function updateUserDepartment(userId: number, id: number, input: UserDepartmentInput) {
  return apiFetch<unknown>(`/organization/users/${userId}/departments/${id}`, { method: "PATCH", body: input });
}

// 대표 소속 지정 (기존 대표 소속은 일반 소속이 된다)
export function setPrimaryUserDepartment(userId: number, id: number) {
  return apiFetch<unknown>(`/organization/users/${userId}/departments/${id}/primary`, { method: "PATCH" });
}

// 소속 삭제 - 대표 소속을 삭제하면 서버가 남은 소속 중 가장 오래된 소속을 대표로 올린다.
export function deleteUserDepartment(userId: number, id: number) {
  return apiFetch<boolean>(`/organization/users/${userId}/departments/${id}`, { method: "DELETE" });
}
