// 백엔드 projects/budgets/project-budgets.controller 대응 (비용 항목·전사 통계·프로젝트 예산·지출)
// 금액은 공급가액만 보내고 부가세·합계는 서버가 계산한다. 증빙 파일은 먼저 /common/files/attachments로 올린 id를 보낸다.
import { apiFetch, apiFetchBlob } from "@/services/api-client";
import type { BudgetCategory, BudgetWarning, ProjectBudgetResult, ProjectCompanyStats, ProjectExpense, ProjectStatsFilters, QuoteTaxType } from "@/types/project";

const categoriesBase = "/projects/budget-categories";
const base = (projectId: number) => `/projects/${projectId}/budgets`;

// 비용 항목 - 조회는 누구나, 변경은 과제 관리 관리자
export function fetchBudgetCategories() {
  return apiFetch<BudgetCategory[]>(categoriesBase);
}

export function createBudgetCategory(name: string) {
  return apiFetch<BudgetCategory>(categoriesBase, { method: "POST", body: { name } });
}

export function updateBudgetCategory(id: number, name: string) {
  return apiFetch<BudgetCategory>(`${categoriesBase}/${id}`, { method: "PATCH", body: { name } });
}

// 숨기기 - 이미 쓴 예산·지출에는 이름이 남는다
export function deleteBudgetCategory(id: number) {
  return apiFetch<boolean>(`${categoriesBase}/${id}`, { method: "DELETE" });
}

// 전사 통계 조건 (모두 선택) - 연도가 없으면 최근 12개월, 프로젝트·거래처가 없으면 전체
export interface ProjectStatsQuery {
  year?: number;
  projectId?: number;
  clientId?: number;
}

// 전사 통계 (과제 관리 관리자)
export function fetchProjectStats(query: ProjectStatsQuery) {
  return apiFetch<ProjectCompanyStats>("/projects/stats", { query: { ...query } });
}

// 통계 필터 선택지 (연도·프로젝트·거래처)
export function fetchProjectStatsFilters() {
  return apiFetch<ProjectStatsFilters>("/projects/stats/filters");
}

export function fetchProjectBudget(projectId: number) {
  return apiFetch<ProjectBudgetResult>(base(projectId));
}

// 항목별 예산 저장 - 목록 전체 교체 (빠진 항목의 예산은 지워진다)
export function saveProjectBudgets(projectId: number, items: { categoryId: number; amount: number }[]) {
  return apiFetch<boolean>(base(projectId), { method: "PUT", body: { items } });
}

export interface ExpenseInput {
  categoryId?: number;
  partnerId?: number | null; // 지급한 협력사 (선택)
  title?: string;
  expenseDate?: string; // "YYYY-MM-DD"
  taxType?: QuoteTaxType;
  vatRate?: number; // % (0~100, 소수 둘째 자리까지, 없으면 10)
  supplyAmount?: number; // 원 단위 정수
  memo?: string | null;
  attachmentIds?: number[]; // 보내면 전체 교체
}

// 예산을 넘어도 저장되고 budgetWarning으로 알려 준다
type SavedExpense = Omit<ProjectExpense, "category" | "partner" | "files"> & { budgetWarning: BudgetWarning | null };

export function createExpense(projectId: number, input: ExpenseInput & { categoryId: number; title: string; expenseDate: string; supplyAmount: number }) {
  return apiFetch<SavedExpense>(`${base(projectId)}/expenses`, { method: "POST", body: input });
}

export function updateExpense(projectId: number, expenseId: number, input: ExpenseInput) {
  return apiFetch<SavedExpense>(`${base(projectId)}/expenses/${expenseId}`, { method: "PATCH", body: input });
}

export function deleteExpense(projectId: number, expenseId: number) {
  return apiFetch<boolean>(`${base(projectId)}/expenses/${expenseId}`, { method: "DELETE" });
}

export function downloadExpenseFile(projectId: number, expenseId: number, fileId: number) {
  return apiFetchBlob(`${base(projectId)}/expenses/${expenseId}/files/${fileId}`);
}
