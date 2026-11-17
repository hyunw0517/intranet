"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDeletedProjectClients,
  fetchProjectClient,
  fetchProjectClients,
  type ProjectClientListQuery,
} from "@/services/api/project-clients";
import {
  fetchDeletedProjects,
  fetchMyTasks,
  fetchProject,
  fetchProjectPartners,
  fetchProjectTasks,
  fetchProjects,
  type ProjectListQuery,
} from "@/services/api/projects";
import { fetchQuote, fetchQuotes } from "@/services/api/project-quotes";
import { fetchSales } from "@/services/api/project-sales";
import { searchUsers } from "@/services/api/users";

// 과제 관리 queryKey - 프로젝트·참여자·과제를 바꾸면 all 접두사로 목록·상세·칸반·내 할 일을 함께 다시 조회한다.
// (진척도가 목록·상세에 함께 보이므로 과제 하나를 옮겨도 목록 숫자가 바뀐다)
export const projectKeys = {
  all: ["projects"] as const,
  list: (query: ProjectListQuery) => [...projectKeys.all, "list", query] as const,
  deleted: (page: number) => [...projectKeys.all, "deleted", page] as const,
  detail: (id: number) => [...projectKeys.all, "detail", id] as const,
  tasks: (id: number) => [...projectKeys.all, "tasks", id] as const,
  partners: (id: number) => [...projectKeys.all, "partners", id] as const,
  quotes: (id: number) => [...projectKeys.all, "quotes", id] as const,
  quote: (id: number, quoteId: number) => [...projectKeys.all, "quotes", id, quoteId] as const,
  sales: (id: number) => [...projectKeys.all, "sales", id] as const,
  myTasks: () => [...projectKeys.all, "my-tasks"] as const,
};

// 거래처는 프로젝트와 따로 바뀌므로 다른 접두사 (거래처 이름을 바꾸면 프로젝트 목록도 다시 보도록 둘 다 무효화한다)
export const clientKeys = {
  all: ["project-clients"] as const,
  list: (query: ProjectClientListQuery) => [...clientKeys.all, "list", query] as const,
  deleted: (query: ProjectClientListQuery) => [...clientKeys.all, "deleted", query] as const,
  detail: (id: number) => [...clientKeys.all, "detail", id] as const,
};

export function useProjects(query: ProjectListQuery) {
  return useQuery({ queryKey: projectKeys.list(query), queryFn: () => fetchProjects(query), placeholderData: keepPreviousData });
}

export function useDeletedProjects(page: number) {
  return useQuery({ queryKey: projectKeys.deleted(page), queryFn: () => fetchDeletedProjects({ page, take: 20 }), placeholderData: keepPreviousData });
}

export function useProject(id: number) {
  return useQuery({ queryKey: projectKeys.detail(id), queryFn: () => fetchProject(id) });
}

export function useProjectTasks(id: number) {
  return useQuery({ queryKey: projectKeys.tasks(id), queryFn: () => fetchProjectTasks(id) });
}

export function useProjectPartners(id: number) {
  return useQuery({ queryKey: projectKeys.partners(id), queryFn: () => fetchProjectPartners(id) });
}

export function useQuotes(projectId: number) {
  return useQuery({ queryKey: projectKeys.quotes(projectId), queryFn: () => fetchQuotes(projectId) });
}

export function useQuote(projectId: number, quoteId: number) {
  return useQuery({ queryKey: projectKeys.quote(projectId, quoteId), queryFn: () => fetchQuote(projectId, quoteId) });
}

// 매출 목록 + 요약 + 확정 견적별 청구 잔액 (projectKeys.all 무효화로 견적 확정·취소 후에도 다시 조회된다)
export function useSales(projectId: number) {
  return useQuery({ queryKey: projectKeys.sales(projectId), queryFn: () => fetchSales(projectId) });
}

export function useMyTasks() {
  return useQuery({ queryKey: projectKeys.myTasks(), queryFn: fetchMyTasks });
}

export function useProjectClients(query: ProjectClientListQuery, enabled = true) {
  return useQuery({ queryKey: clientKeys.list(query), queryFn: () => fetchProjectClients(query), placeholderData: keepPreviousData, enabled });
}

export function useDeletedProjectClients(query: ProjectClientListQuery, enabled = true) {
  return useQuery({ queryKey: clientKeys.deleted(query), queryFn: () => fetchDeletedProjectClients(query), placeholderData: keepPreviousData, enabled });
}

export function useProjectClient(id: number | null) {
  return useQuery({ queryKey: clientKeys.detail(id ?? 0), queryFn: () => fetchProjectClient(id!), enabled: id !== null });
}

// 회원 검색 (참여자 추가) - 입력이 비어 있으면 조회하지 않는다
export function useUserSearch(search: string) {
  const keyword = search.trim();
  return useQuery({
    queryKey: ["users", "search", keyword],
    queryFn: () => searchUsers(keyword),
    enabled: keyword.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

// 변경 후 과제 관리 화면 전체를 다시 조회한다 (여러 화면에서 쓰는 변경이라 훅 파일에 둔다)
export function useProjectMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

// 거래처 변경 후 거래처·프로젝트 목록을 함께 다시 조회한다
export function useClientMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clientKeys.all }),
        queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      ]);
    },
  });
}
