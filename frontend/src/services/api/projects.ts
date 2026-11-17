// 백엔드 projects/projects.controller(ProjectsController·ProjectMembersController) + tasks/project-tasks.controller 대응
// 권한(참여자·책임자·관리자)은 서버가 프로젝트마다 확인한다. 화면은 상세의 myAccess로 버튼만 고른다.
import { apiFetch } from "@/services/api-client";
import type { PageResult } from "@/types/pagination";
import type {
  MyTask,
  ProjectDetail,
  ProjectListItem,
  ProjectMember,
  ProjectMemberRole,
  ProjectPartner,
  ProjectStatus,
  ProjectTask,
  ProjectTaskStatus,
  QuoteTaxType,
} from "@/types/project";

export interface ProjectListQuery {
  page?: number;
  take?: number;
  order?: "asc" | "desc";
  scope?: "mine" | "all"; // all은 과제 관리 관리자만 (그 외 403)
  status?: ProjectStatus;
  clientId?: number;
  search?: string;
}

export function fetchProjects(query: ProjectListQuery) {
  return apiFetch<PageResult<ProjectListItem>>("/projects", { query: { ...query } });
}

// 삭제된 프로젝트 (과제 관리 관리자, 복구용)
export function fetchDeletedProjects(query: { page?: number; take?: number }) {
  return apiFetch<PageResult<ProjectListItem>>("/projects/deleted", { query: { ...query } });
}

export function fetchProject(id: number) {
  return apiFetch<ProjectDetail>(`/projects/${id}`);
}

export interface ProjectInput {
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string | null; // "YYYY-MM-DD"
  endDate?: string | null;
  clientId?: number | null;
}

// 만든 사람이 책임자로 함께 등록된다. 시작 > 종료 400, 삭제된 거래처 404
export function createProject(input: ProjectInput) {
  return apiFetch<ProjectListItem>("/projects", { method: "POST", body: input });
}

export function updateProject(id: number, input: Partial<ProjectInput>) {
  return apiFetch<ProjectListItem>(`/projects/${id}`, { method: "PATCH", body: input });
}

export function deleteProject(id: number) {
  return apiFetch<boolean>(`/projects/${id}`, { method: "DELETE" });
}

export function restoreProject(id: number) {
  return apiFetch<ProjectListItem>(`/projects/${id}/restore`, { method: "PATCH" });
}

//* 참여자 (책임자·관리자) - 이미 참여 중 409, 마지막 책임자 빼기·강등 400
export function addProjectMember(projectId: number, input: { userId: number; role?: ProjectMemberRole }) {
  return apiFetch<ProjectMember>(`/projects/${projectId}/members`, { method: "POST", body: input });
}

export function updateProjectMember(projectId: number, memberId: number, input: { role: ProjectMemberRole }) {
  return apiFetch<ProjectMember>(`/projects/${projectId}/members/${memberId}`, { method: "PATCH", body: input });
}

export function removeProjectMember(projectId: number, memberId: number) {
  return apiFetch<boolean>(`/projects/${projectId}/members/${memberId}`, { method: "DELETE" });
}

//* 협력사 (하청기업, 참여자 누구나) - 같은 회사 활성 중복 409, 계약 기간 역순·음수·소수 금액 400
export function fetchProjectPartners(projectId: number) {
  return apiFetch<ProjectPartner[]>(`/projects/${projectId}/partners`);
}

export interface ProjectPartnerInput {
  clientId: number;
  workScope?: string | null;
  contractAmount?: number | null; // 원 단위 정수, 공급가액 (최대 999조) - 부가세·합계는 서버가 계산
  taxType?: QuoteTaxType;
  vatRate?: number; // % (0~100, 소수 둘째 자리까지, 없으면 10)
  startDate?: string | null;
  endDate?: string | null;
  // 담당자 (최대 20명, 이름 필수) - 보내면 목록 전체 교체, 보낸 순서가 표시 순서
  contacts?: { name: string; role?: string | null; hp?: string | null; email?: string | null }[];
}

export function createProjectPartner(projectId: number, input: ProjectPartnerInput) {
  return apiFetch<ProjectPartner>(`/projects/${projectId}/partners`, { method: "POST", body: input });
}

// 회사(clientId)는 바꿀 수 없다 (다른 회사면 빼고 새로 추가)
export function updateProjectPartner(projectId: number, partnerId: number, input: Partial<Omit<ProjectPartnerInput, "clientId">>) {
  return apiFetch<ProjectPartner>(`/projects/${projectId}/partners/${partnerId}`, { method: "PATCH", body: input });
}

export function removeProjectPartner(projectId: number, partnerId: number) {
  return apiFetch<boolean>(`/projects/${projectId}/partners/${partnerId}`, { method: "DELETE" });
}

//* 과제 (참여자 누구나)
export function fetchProjectTasks(projectId: number) {
  return apiFetch<ProjectTask[]>(`/projects/${projectId}/tasks`);
}

export interface ProjectTaskInput {
  title: string;
  description?: string | null;
  status?: ProjectTaskStatus; // 생성 때만 (그 컬럼 맨 아래)
  assigneeId?: number | null; // 현재 참여자만
  dueDate?: string | null; // "YYYY-MM-DD"
}

export function createProjectTask(projectId: number, input: ProjectTaskInput) {
  return apiFetch<ProjectTask>(`/projects/${projectId}/tasks`, { method: "POST", body: input });
}

// 상태·순서는 move로만 바꾼다. 부재 담당자 교체는 책임자·관리자만(403)
export function updateProjectTask(projectId: number, taskId: number, input: Partial<Omit<ProjectTaskInput, "status">>) {
  return apiFetch<ProjectTask>(`/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", body: input });
}

// 칸반 이동: 옮길 컬럼과 그 컬럼 안 위치(0부터, 넘으면 맨 끝)
export function moveProjectTask(projectId: number, taskId: number, input: { status: ProjectTaskStatus; index: number }) {
  return apiFetch<ProjectTask>(`/projects/${projectId}/tasks/${taskId}/move`, { method: "PATCH", body: input });
}

export function deleteProjectTask(projectId: number, taskId: number) {
  return apiFetch<boolean>(`/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
}

// 내 할 일 (내가 담당인 미완료 과제, 마감일 순)
export function fetchMyTasks() {
  return apiFetch<MyTask[]>("/projects/my-tasks");
}
