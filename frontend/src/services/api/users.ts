// 백엔드 users.controller 대응 (/users/*)
import { apiFetch } from "@/services/api-client";
import type { NamedRef, UserDepartmentItem } from "@/types/organization";
import type { PageResult } from "@/types/pagination";
import type { CurrentUser, UserRole, UserStatus } from "@/types/user";

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

// 내 정보 조회 (로그인 직후·새로고침 시 현재 사용자 확인)
export function fetchMe() {
  return apiFetch<CurrentUser>("/users/me");
}

// 내 정보 수정 (마이페이지) → 수정된 내 정보
export function updateMe(input: UpdateMeInput) {
  return apiFetch<CurrentUser>("/users/me", { method: "PATCH", body: input });
}

// ── 관리자 ────────────────────────────────────────────────────────

// GET /users 정렬 기준 (UserSortBy) - 소속은 대표 소속 부서명, 직급은 순위(sortOrder) 기준
export type UserSortBy = "createdAt" | "empNo" | "name" | "department" | "position";
export type SortOrder = "asc" | "desc";

// GET /users (PaginateUserQueryDto) - 검색 필드는 각각 부분 일치
// apiFetch의 query(Record)에 그대로 넘길 수 있도록 interface가 아닌 type으로 선언
export type UserListQuery = {
  page?: number;
  take?: number;
  empNo?: string;
  email?: string;
  name?: string;
  departmentName?: string; // 겸직 포함, 소속 중 하나라도 부분 일치
  role?: UserRole;
  status?: UserStatus;
  positionId?: number;
  jobTitleId?: number; // 겸직 포함, 소속 중 하나라도 해당 직책
  sortBy?: UserSortBy; // 생략하면 가입일(createdAt)
  order?: SortOrder; // 생략하면 desc
  deletedOnly?: boolean; // true면 삭제된 회원만
};

// GET /users 목록 항목 (소속은 대표 소속만 포함)
export interface AdminUserListItem {
  id: number;
  empNo: string;
  email: string;
  name: string;
  nickname: string | null;
  role: UserRole;
  status: UserStatus;
  deletedAt: string | null;
  position: NamedRef | null;
  departments: UserDepartmentItem[];
}

// GET /users/:id (개인정보 포함, 소속은 대표 소속부터 전체)
export interface AdminUserDetail {
  id: number;
  empNo: string;
  email: string;
  name: string;
  nickname: string | null;
  birthday: string | null;
  hp: string | null;
  tel: string | null;
  joinAt: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  position: NamedRef | null;
  departments: UserDepartmentItem[];
}

// PATCH /users/:id (AdminUpdateUserDto) - 선택 항목은 빈 문자열이면 서버에서 null로 저장
export interface AdminUpdateUserInput {
  empNo: string;
  email: string;
  name: string;
  nickname: string;
  birthday: string;
  hp: string;
  tel: string;
  joinAt: string;
}

// PATCH /users/:id/role (UpdateUserRoleDto) - GUEST → USER/ADMIN이 가입 승인
// 입사일은 받지 않는다. 승인 대기 회원은 입사일이 먼저 등록되어 있어야 한다. (없으면 서버 400)
export type ApprovedRole = Exclude<UserRole, "GUEST">;

// (관리자) 회원 목록 - 페이지 + 검색·권한·상태 필터, deletedOnly면 삭제된 회원만
export function fetchUsers(query: UserListQuery) {
  return apiFetch<PageResult<AdminUserListItem>>("/users", { query });
}

// (관리자) 회원 상세 - 삭제된 회원은 서버가 400
export function fetchUser(id: number) {
  return apiFetch<AdminUserDetail>(`/users/${id}`);
}

// (관리자) 회원 기본 정보 수정 (사번·입사일 포함, 비밀번호 제외)
export function adminUpdateUser(id: number, input: AdminUpdateUserInput) {
  return apiFetch<AdminUserDetail>(`/users/${id}`, { method: "PATCH", body: input });
}

// (관리자) 가입 승인 또는 권한 변경 (USER ↔ ADMIN)
export function updateUserRole(id: number, role: ApprovedRole) {
  return apiFetch<boolean>(`/users/${id}/role`, { method: "PATCH", body: { role } });
}

// (관리자) 계정 상태 변경 (재직·비활성·퇴사) → 재직이 아니면 다음 요청부터 차단
export function updateUserStatus(id: number, status: UserStatus) {
  return apiFetch<boolean>(`/users/${id}/status`, { method: "PATCH", body: { status } });
}

// 관리자 삭제 (soft delete) → 복구 전까지 로그인 불가
export function deleteUser(id: number) {
  return apiFetch<boolean>(`/users/${id}`, { method: "DELETE" });
}

// (관리자) 삭제된 회원 복구 → 권한·상태는 삭제 전 그대로
export function restoreUser(id: number) {
  return apiFetch<AdminUserDetail>(`/users/${id}/delete_recovery`, { method: "PATCH" });
}

// ── 관리자 일괄 처리 (선택한 회원) ─────────────────────────────────
// 단건 API와 같은 서비스 로직을 쓴다. 한 명이라도 처리할 수 없으면(본인 포함, 삭제된 회원 등) 전체가 400으로 실패한다.

// (관리자) 선택한 회원 일괄 삭제 (soft delete)
export function bulkDeleteUsers(ids: number[]) {
  return apiFetch<boolean>("/users/bulk", { method: "DELETE", body: { ids } });
}

// (관리자) 선택한 회원 권한 일괄 변경 - 입사일이 없는 승인 대기 회원이 있으면 400 (메시지에 이름 포함)
export function bulkUpdateUsersRole(ids: number[], role: ApprovedRole) {
  return apiFetch<boolean>("/users/bulk/role", { method: "PATCH", body: { ids, role } });
}

// (관리자) 선택한 회원 상태 일괄 변경
export function bulkUpdateUsersStatus(ids: number[], status: UserStatus) {
  return apiFetch<boolean>("/users/bulk/status", { method: "PATCH", body: { ids, status } });
}
