// 백엔드 departments.controller 대응 (/departments/*)
import { apiFetch } from "@/services/api-client";
import type { Department } from "@/types/organization";

// POST /departments, PATCH /departments/:id (CreateDepartmentDto / UpdateDepartmentDto)
export interface DepartmentInput {
  name: string;
  parentDepartmentId: number | null; // null이면 최상위 부서
}

// 부서 목록 - 개수가 적어 페이지네이션 없이 트리 순서 전체를 받는다.
export function fetchDepartments() {
  return apiFetch<Department[]>("/departments");
}

// 부서 추가 (parentDepartmentId가 있으면 그 부서의 하위로)
export function createDepartment(input: DepartmentInput) {
  return apiFetch<Department>("/departments", { method: "POST", body: input });
}

// 부서 이름·상위 부서 변경 (자기 자신·하위 부서를 상위로 지정하면 서버가 400)
export function updateDepartment(id: number, input: DepartmentInput) {
  return apiFetch<Department>(`/departments/${id}`, { method: "PATCH", body: input });
}

// 부서 삭제 - 하위 부서나 소속 인원이 있으면 서버가 400으로 거부한다.
export function deleteDepartment(id: number) {
  return apiFetch<boolean>(`/departments/${id}`, { method: "DELETE" });
}

// 부서 순서 변경 - 같은 상위 부서(null이면 최상위) 아래의 형제 부서 id 전체를 화면 순서대로 보낸다.
export function reorderDepartments(parentDepartmentId: number | null, ids: number[]) {
  return apiFetch<boolean>("/departments/order", { method: "PATCH", body: { parentDepartmentId, ids } });
}
