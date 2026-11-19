// 백엔드 organization/org-chart.controller 대응 - 사용자용 조직도·사원 검색 (USER 이상)
// 관리자용 /departments·/users와 달리 다른 직원에게 보여도 되는 값만 온다. (이메일·회사 전화 공개, 휴대폰·생일 비공개)
import { apiFetch } from "@/services/api-client";
import type { PageResult } from "@/types/pagination";

// GET /organization/chart - 트리 순서(상위 → 하위)의 평평한 목록
export interface OrgChartDepartment {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  depth: number; // 최상위 0
  memberCount: number; // 이 부서에 직접 소속된 인원 (겸직 포함, 하위 부서 제외)
}

export interface DirectoryDepartment {
  departmentId: number;
  departmentName: string;
  jobTitleName: string | null;
  isPrimary: boolean; // false면 겸직
}

// 조직도 구성원·사원 검색 공용 (상세 창도 이 값을 그대로 쓴다)
export interface DirectoryUser {
  id: number;
  empNo: string;
  name: string;
  email: string;
  tel: string | null; // 회사 전화
  positionName: string | null;
  profileImageUrl: string | null;
  departments: DirectoryDepartment[]; // 대표 소속 먼저
}

export type DirectoryQuery = {
  search?: string; // 이름·사번·부서명
  page?: number;
  take?: number;
};

export function fetchOrgChart() {
  return apiFetch<OrgChartDepartment[]>("/organization/chart");
}

// 부서 구성원 - 직책 → 직급 → 이름 순 (서버 정렬)
export function fetchDepartmentMembers(departmentId: number) {
  return apiFetch<DirectoryUser[]>(`/organization/chart/${departmentId}/members`);
}

// 사원 한 명 - id만 아는 화면(채팅 보낸 사람)의 상세 창. 재직 중이 아니면 404
export function fetchDirectoryUser(userId: number) {
  return apiFetch<DirectoryUser>(`/organization/directory/${userId}`);
}

// 사원 검색 - 이름순 페이지
export function fetchDirectory(query: DirectoryQuery) {
  return apiFetch<PageResult<DirectoryUser>>("/organization/directory", { query });
}
