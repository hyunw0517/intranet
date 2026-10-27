// 백엔드 positions.controller 대응 (/positions/*)
import { apiFetch } from "@/services/api-client";
import type { Position } from "@/types/organization";
import type { PageResult } from "@/types/pagination";

// 직급 목록 - 수가 적으므로 한 번에 최대치(100)를 정렬 순서대로 받는다.
export function fetchPositions() {
  return apiFetch<PageResult<Position>>("/positions", { query: { take: 100 } });
}

// 직급 추가 - 정렬 순서는 서버가 생성 순서로 정한다. (순서 변경 API 없음)
export function createPosition(name: string) {
  return apiFetch<Position>("/positions", { method: "POST", body: { name } });
}

// 직급 이름 변경
export function updatePosition(id: number, name: string) {
  return apiFetch<Position>(`/positions/${id}`, { method: "PATCH", body: { name } });
}

// 직급 삭제
export function deletePosition(id: number) {
  return apiFetch<boolean>(`/positions/${id}`, { method: "DELETE" });
}
