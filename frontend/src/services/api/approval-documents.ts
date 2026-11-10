// 백엔드 approvals/approval-documents.controller 대응 (/approvals/document-types, /approvals/documents)
// 상태 변경은 PATCH :id/<동작>. 동시 처리로 상태가 이미 바뀌었으면 409 (새로고침 안내)
import { apiFetch, apiFetchBlob } from "@/services/api-client";
import type { PageResult } from "@/types/pagination";
import type { ApprovalBox, ApprovalDocument, ApprovalDocumentType, ApprovalListItem, ApprovalStatus } from "@/types/approval";

// 쓸 수 있는 문서 유형 (directCreate: false는 업무 화면(휴가 등)에서 만든다)
export function fetchDocumentTypes() {
  return apiFetch<{ type: ApprovalDocumentType; directCreate: boolean }[]>("/approvals/document-types");
}

export interface ApprovalListQuery {
  box: ApprovalBox;
  status?: ApprovalStatus;
  page?: number;
  take?: number;
}

// 결재함 (all은 관리자만 - 그 외 403)
export function fetchApprovalDocuments(query: ApprovalListQuery) {
  return apiFetch<PageResult<ApprovalListItem>>("/approvals/documents", { query: { ...query } });
}

// 결재함 탭 건수 - 기안함(mine)은 결재요청·결재중인 내 문서만 센다 (목록은 완료·반려·회수까지 보임)
export interface ApprovalBoxCounts {
  pending: number;
  upcoming: number;
  mine: number;
  drafts: number;
}

export function fetchApprovalCounts() {
  return apiFetch<ApprovalBoxCounts>("/approvals/documents/counts");
}

// 상세 (기안자·결재라인·관리자, 임시저장은 기안자만 - 그 외 404)
export function fetchApprovalDocument(id: number) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}`);
}

// 배열 순서 = 결재 순서
export interface ApprovalDocumentInput {
  documentType?: ApprovalDocumentType; // 생성 때만
  title: string;
  content: string;
  steps: { approverId: number }[];
  approvalLineTemplateId?: number | null;
  attachmentIds: number[];
}

// 임시저장 생성 (상신은 따로)
export function createApprovalDocument(input: ApprovalDocumentInput & { documentType: ApprovalDocumentType }) {
  return apiFetch<ApprovalDocument>("/approvals/documents", { method: "POST", body: input });
}

// 임시저장 수정 (steps·attachmentIds는 보내면 전체 교체)
export function updateApprovalDocument(id: number, input: Omit<ApprovalDocumentInput, "documentType">) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}`, { method: "PATCH", body: input });
}

export function deleteApprovalDocument(id: number) {
  return apiFetch<void>(`/approvals/documents/${id}`, { method: "DELETE" });
}

// 상신 (결재자 검사·스냅샷은 서버에서, 결재자 문제는 400)
export function submitApprovalDocument(id: number) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/submit`, { method: "PATCH" });
}

// 회수 (첫 승인 전까지)
export function cancelApprovalDocument(id: number) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/cancel`, { method: "PATCH" });
}

export function approveApprovalDocument(id: number, comment: string | null) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/approve`, { method: "PATCH", body: { comment } });
}

// 반려 (의견 필수)
export function rejectApprovalDocument(id: number, comment: string) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/reject`, { method: "PATCH", body: { comment } });
}

// 다시 기안 → 새 임시저장 문서
export function copyApprovalDocument(id: number) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/copy`, { method: "POST" });
}

// 관리자 결재자 교체 (진행 중 문서의 남은 단계)
export function replaceApprover(id: number, stepOrder: number, approverId: number) {
  return apiFetch<ApprovalDocument>(`/approvals/documents/${id}/steps/${stepOrder}`, { method: "PATCH", body: { approverId } });
}

// 첨부 다운로드 (열람 권한)
export function downloadApprovalFile(id: number, fileId: number) {
  return apiFetchBlob(`/approvals/documents/${id}/files/${fileId}`);
}
