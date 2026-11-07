// 백엔드 job-titles.controller 대응 (/job-titles/*)
import { apiFetch } from "@/services/api-client";
import type { JobTitle } from "@/types/organization";
import type { PageResult } from "@/types/pagination";

// 직책 목록 - 수가 적으므로 한 번에 최대치(100)를 정렬 순서대로 받는다.
export function fetchJobTitles() {
  return apiFetch<PageResult<JobTitle>>("/job-titles", { query: { take: 100 } });
}

// 직책 추가 - 목록 맨 아래에 추가된다. (순서는 [순서 저장]으로 변경)
export function createJobTitle(name: string) {
  return apiFetch<JobTitle>("/job-titles", { method: "POST", body: { name } });
}

// 직책 이름 변경
export function updateJobTitle(id: number, name: string) {
  return apiFetch<JobTitle>(`/job-titles/${id}`, { method: "PATCH", body: { name } });
}

// 직책 삭제 - 사용 중이면(소속의 직책, 게시판 권한의 허용 직책) 서버가 400으로 거부한다.
export function deleteJobTitle(id: number) {
  return apiFetch<boolean>(`/job-titles/${id}`, { method: "DELETE" });
}

// 직책 순서 변경 - 화면의 최종 순서대로 id 전체를 보낸다. (목록이 그 사이 바뀌었으면 서버가 400)
export function reorderJobTitles(ids: number[]) {
  return apiFetch<boolean>("/job-titles/order", { method: "PATCH", body: { ids } });
}
