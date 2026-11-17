// 백엔드 projects/clients/project-clients.controller 대응 (/projects/clients) - USER 이상 누구나 등록·수정·삭제·복구
import { apiFetch } from "@/services/api-client";
import type { PageResult } from "@/types/pagination";
import type { ProjectClient, ProjectClientContact } from "@/types/project";

export interface ProjectClientListQuery {
  page?: number;
  take?: number;
  search?: string; // 회사명·사업자번호
}

export function fetchProjectClients(query: ProjectClientListQuery) {
  return apiFetch<PageResult<ProjectClient>>("/projects/clients", { query: { ...query } });
}

// [삭제된 거래처] - 삭제한 사람(deletedBy)·시각 포함
export function fetchDeletedProjectClients(query: ProjectClientListQuery) {
  return apiFetch<PageResult<ProjectClient>>("/projects/clients/deleted", { query: { ...query } });
}

// 상세 (삭제된 거래처도, 담당자 포함)
export function fetchProjectClient(id: number) {
  return apiFetch<ProjectClient>(`/projects/clients/${id}`);
}

export interface ProjectClientInput {
  name: string;
  businessNo?: string | null; // 하이픈은 서버가 지운다. 숫자 10자리, 삭제 안 된 거래처끼리 중복 400
  ceoName?: string | null;
  address?: string | null;
  tel?: string | null;
  memo?: string | null;
}

export function createProjectClient(input: ProjectClientInput) {
  return apiFetch<ProjectClient>("/projects/clients", { method: "POST", body: input });
}

export function updateProjectClient(id: number, input: Partial<ProjectClientInput>) {
  return apiFetch<ProjectClient>(`/projects/clients/${id}`, { method: "PATCH", body: input });
}

export function deleteProjectClient(id: number) {
  return apiFetch<boolean>(`/projects/clients/${id}`, { method: "DELETE" });
}

// 같은 사업자번호의 거래처가 이미 있으면 400
export function restoreProjectClient(id: number) {
  return apiFetch<ProjectClient>(`/projects/clients/${id}/restore`, { method: "PATCH" });
}

export type ProjectClientContactInput = Omit<ProjectClientContact, "id">;

export function createProjectClientContact(clientId: number, input: Partial<ProjectClientContactInput> & { name: string }) {
  return apiFetch<ProjectClientContact>(`/projects/clients/${clientId}/contacts`, { method: "POST", body: input });
}

export function updateProjectClientContact(clientId: number, contactId: number, input: Partial<ProjectClientContactInput>) {
  return apiFetch<ProjectClientContact>(`/projects/clients/${clientId}/contacts/${contactId}`, { method: "PATCH", body: input });
}

export function deleteProjectClientContact(clientId: number, contactId: number) {
  return apiFetch<boolean>(`/projects/clients/${clientId}/contacts/${contactId}`, { method: "DELETE" });
}
