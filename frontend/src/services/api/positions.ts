// 백엔드 positions.controller 대응 (/positions/*)
import { apiFetch } from "@/services/api-client";
import type { Position } from "@/types/organization";
import type { PageResult } from "@/types/pagination";

// 직급 목록 - 수가 적으므로 한 번에 최대치(100)를 정렬 순서대로 받는다.
export function fetchPositions() {
  return apiFetch<PageResult<Position>>("/positions", { query: { take: 100 } });
}

// 직급 추가 - 목록 맨 아래에 추가된다. (순서는 [순서 저장]으로 변경)
export function createPosition(name: string) {
  return apiFetch<Position>("/positions", { method: "POST", body: { name } });
}

// 직급 이름 변경
export function updatePosition(id: number, name: string) {
  return apiFetch<Position>(`/positions/${id}`, { method: "PATCH", body: { name } });
}

// 직급 삭제 - 사용 중이면(회원의 직급, 게시판 권한의 최소 직급) 서버가 400으로 거부한다.
export function deletePosition(id: number) {
  return apiFetch<boolean>(`/positions/${id}`, { method: "DELETE" });
}

// 직급 순서 변경 - 화면의 최종 순서대로 id 전체를 보낸다. (목록이 그 사이 바뀌었으면 서버가 400)
export function reorderPositions(ids: number[]) {
  return apiFetch<boolean>("/positions/order", { method: "PATCH", body: { ids } });
}
