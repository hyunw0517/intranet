import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchDepartmentMembers, fetchDirectory, fetchOrgChart, type DirectoryQuery } from "@/services/api/org-chart";

export const orgChartKeys = {
  all: ["org-chart"] as const,
  chart: () => [...orgChartKeys.all, "chart"] as const,
  members: (departmentId: number) => [...orgChartKeys.all, "members", departmentId] as const,
  directory: (query: DirectoryQuery) => [...orgChartKeys.all, "directory", query] as const,
};

export function useOrgChart() {
  return useQuery({ queryKey: orgChartKeys.chart(), queryFn: fetchOrgChart });
}

// 부서를 고르기 전(null)에는 부르지 않는다
export function useDepartmentMembers(departmentId: number | null) {
  return useQuery({
    queryKey: orgChartKeys.members(departmentId ?? 0),
    queryFn: () => fetchDepartmentMembers(departmentId!),
    enabled: departmentId !== null,
  });
}

// 페이지를 넘길 때 이전 페이지를 흐리게 보여 준다 (keepPreviousData)
export function useDirectory(query: DirectoryQuery) {
  return useQuery({
    queryKey: orgChartKeys.directory(query),
    queryFn: () => fetchDirectory(query),
    placeholderData: keepPreviousData,
  });
}
