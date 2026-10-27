// 백엔드 job-titles.controller 대응 (/job-titles/*)
import { apiFetch } from "@/services/api-client";
import type { JobTitle } from "@/types/organization";
import type { PageResult } from "@/types/pagination";

// 직책 목록 - 수가 적으므로 한 번에 최대치(100)를 정렬 순서대로 받는다.
export function fetchJobTitles() {
  return apiFetch<PageResult<JobTitle>>("/job-titles", { query: { take: 100 } });
}

// 직책 추가 - 정렬 순서는 서버가 생성 순서로 정한다. (순서 변경 API 없음)
export function createJobTitle(name: string) {
  return apiFetch<JobTitle>("/job-titles", { method: "POST", body: { name } });
}

// 직책 이름 변경
export function updateJobTitle(id: number, name: string) {
  return apiFetch<JobTitle>(`/job-titles/${id}`, { method: "PATCH", body: { name } });
}

// 직책 삭제
export function deleteJobTitle(id: number) {
  return apiFetch<boolean>(`/job-titles/${id}`, { method: "DELETE" });
}
