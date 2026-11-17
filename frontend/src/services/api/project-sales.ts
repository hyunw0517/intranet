// 백엔드 projects/sales/project-sales.controller 대응 (/projects/:projectId/sales) - 참여자 누구나
// 금액은 공급가액만 보내고 부가세·합계는 서버가 계산한다. 세금계산서 파일은 먼저 /common/files/attachments로 올린 id를 보낸다.
import { apiFetch, apiFetchBlob } from "@/services/api-client";
import type { ProjectSale, QuoteTaxType, SaleListResult, SalePayment } from "@/types/project";

const base = (projectId: number) => `/projects/${projectId}/sales`;

export interface SaleInput {
  title?: string;
  quoteVersionId?: number | null; // 확정 견적 (선택) - 청구 합계 ≤ 견적 합계 (넘으면 400)
  taxType?: QuoteTaxType;
  vatRate?: number; // % (0~100, 소수 둘째 자리까지, 없으면 10)
  supplyAmount?: number;
  plannedDate?: string | null;
  billedDate?: string | null; // 만들 때만: 있으면 바로 "청구"
  taxInvoiceNo?: string | null;
  memo?: string | null;
  attachmentIds?: number[]; // 보내면 전체 교체
}

export function fetchSales(projectId: number) {
  return apiFetch<SaleListResult>(base(projectId));
}

export function createSale(projectId: number, input: SaleInput & { title: string; supplyAmount: number }) {
  return apiFetch<ProjectSale>(base(projectId), { method: "POST", body: input });
}

// 청구 예정: 전부 / 청구: 청구명·승인번호·메모·첨부만 (금액 등은 400)
export function updateSale(projectId: number, saleId: number, input: Omit<SaleInput, "billedDate">) {
  return apiFetch<ProjectSale>(`${base(projectId)}/${saleId}`, { method: "PATCH", body: input });
}

export function billSale(projectId: number, saleId: number, input: { billedDate: string; taxInvoiceNo?: string | null; attachmentIds?: number[] }) {
  return apiFetch<boolean>(`${base(projectId)}/${saleId}/bill`, { method: "PATCH", body: input });
}

// 수금이 있으면 400
export function cancelSale(projectId: number, saleId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${saleId}/cancel`, { method: "PATCH" });
}

// 청구 예정만
export function deleteSale(projectId: number, saleId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${saleId}`, { method: "DELETE" });
}

// 수금 합계 > 청구 금액이면 400
export function addSalePayment(projectId: number, saleId: number, input: { paidDate: string; amount: number; memo?: string | null }) {
  return apiFetch<SalePayment>(`${base(projectId)}/${saleId}/payments`, { method: "POST", body: input });
}

export function deleteSalePayment(projectId: number, saleId: number, paymentId: number) {
  return apiFetch<boolean>(`${base(projectId)}/${saleId}/payments/${paymentId}`, { method: "DELETE" });
}

export function downloadSaleFile(projectId: number, saleId: number, fileId: number) {
  return apiFetchBlob(`${base(projectId)}/${saleId}/files/${fileId}`);
}
