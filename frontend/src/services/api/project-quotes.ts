// 백엔드 projects/quotes/project-quotes.controller + quote-approval.controller 대응 (/projects/:projectId/quotes)
// 참여자 누구나 작성·수정·새 버전·결재 상신·확정·확정 취소. 금액은 서버가 계산한다(수량 × 단가, 부가세).
import { apiFetch } from "@/services/api-client";
import type { QuoteDetail, QuoteListResult, QuoteTaxType } from "@/types/project";

export interface QuoteItemInput {
  name: string;
  spec?: string | null;
  quantity: number; // 1 이상 정수
  unitPrice: number; // 원 단위 정수
  note?: string | null;
}

export interface QuoteInput {
  title?: string;
  taxType?: QuoteTaxType;
  vatRate?: number; // % (0~100, 소수 둘째 자리까지, 없으면 10)
  quoteDate?: string; // "YYYY-MM-DD" (없으면 오늘)
  validUntil?: string | null;
  contactId?: number | null; // 발주처 담당자 (수신자)
  note?: string | null;
  items?: QuoteItemInput[]; // 보내면 전체 교체
}

const base = (projectId: number) => `/projects/${projectId}/quotes`;

export function fetchQuotes(projectId: number) {
  return apiFetch<QuoteListResult>(base(projectId));
}

export function fetchQuote(projectId: number, quoteId: number) {
  return apiFetch<QuoteDetail>(`${base(projectId)}/${quoteId}`);
}

// 발주처가 없는 프로젝트는 400
export function createQuote(projectId: number, input: QuoteInput & { title: string }) {
  return apiFetch<{ id: number; quoteNo: string }>(base(projectId), { method: "POST", body: input });
}

// 최신 작성 중(또는 반려) 버전만
export function updateQuoteVersion(projectId: number, quoteId: number, versionId: number, input: QuoteInput) {
  return apiFetch<boolean>(`${base(projectId)}/${quoteId}/versions/${versionId}`, { method: "PATCH", body: input });
}

// 최신 버전 복사 (확정·결재 중이면 400)
export function createQuoteVersion(projectId: number, quoteId: number) {
  return apiFetch<{ id: number; version: number }>(`${base(projectId)}/${quoteId}/versions`, { method: "POST" });
}

export function deleteQuoteVersion(projectId: number, quoteId: number, versionId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${quoteId}/versions/${versionId}`, { method: "DELETE" });
}

export function deleteQuote(projectId: number, quoteId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${quoteId}`, { method: "DELETE" });
}

// 직접 확정 (결재가 꺼진 배포에서만)
export function confirmQuote(projectId: number, quoteId: number, versionId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${quoteId}/versions/${versionId}/confirm`, { method: "PATCH" });
}

export function cancelQuoteConfirm(projectId: number, quoteId: number, versionId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${quoteId}/versions/${versionId}/cancel`, { method: "PATCH" });
}

// 결재 상신 (결재가 켜져 있을 때만 있는 API) - 결재라인만 보내고 제목·본문은 서버가 견적에서 만든다
export function submitQuote(projectId: number, quoteId: number, versionId: number, steps: { approverIds: number[]; name?: string | null }[]) {
  return apiFetch<{ approvalDocumentId: number }>(`${base(projectId)}/${quoteId}/versions/${versionId}/submit`, { method: "POST", body: { steps } });
}
