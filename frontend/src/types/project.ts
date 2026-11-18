// 과제 관리 (애드온 projects) 응답 타입 - 백엔드 projects/* 서비스 응답 기준 (docs/design/projects.md 5장)
// 날짜만 있는 값(startDate·endDate·dueDate)은 @db.Date라 "2026-11-17T00:00:00.000Z" 형태로 온다 → 앞 10자리 사용(lib/format formatDate)

export type ProjectStatus = "PLANNED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CLOSED" | "CANCELLED";
export type ProjectMemberRole = "MANAGER" | "MEMBER";
export type ProjectTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

// 화면 표시 순서 = 목록 상태 탭 순서
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNED: "준비",
  IN_PROGRESS: "진행",
  ON_HOLD: "보류",
  COMPLETED: "완료",
  CLOSED: "종료", // 완료와 별개 - 유지보수까지 끝나 완전히 닫힘
  CANCELLED: "취소",
};
export const PROJECT_STATUSES = Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[];

export const MEMBER_ROLE_LABEL: Record<ProjectMemberRole, string> = {
  MANAGER: "책임자",
  MEMBER: "참여자",
};

// 칸반 컬럼 순서 (고정 3단계)
export const TASK_STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  TODO: "할 일",
  IN_PROGRESS: "진행",
  DONE: "완료",
};
export const TASK_STATUSES = Object.keys(TASK_STATUS_LABEL) as ProjectTaskStatus[];

export interface ProjectClientRef {
  id: number;
  name: string;
  deleted: boolean; // 삭제된 거래처도 실제 이름을 보여 준다
}

export interface ProjectProgress {
  done: number;
  total: number;
  percent: number; // 소수점 버림
}

// GET /projects 한 행 - 전체 목록은 누구나 보므로 설명은 오지 않는다(상세에서만)
export interface ProjectListItem {
  id: number;
  name: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  clientId: number | null;
  client: ProjectClientRef | null;
  managers: { id: number; name: string }[];
  memberCount: number;
  progress: ProjectProgress;
  isMember?: boolean; // 내가 참여 중인지 (목록에만)
  canOpen?: boolean; // 상세에 들어갈 수 있는지 = 참여자 또는 과제 관리 관리자 (목록에만)
  createdAt: string;
  deletedAt?: string | null;
}

export interface ProjectMember {
  id: number; // 참여자 행 id (역할 수정·제외에 쓴다)
  role: ProjectMemberRole;
  createdAt: string;
  user: { id: number; name: string; status: string; deleted: boolean; position: { name: string } | null };
}

// 화면이 버튼을 보이고 숨기는 데 쓴다 (서버도 같은 기준으로 다시 확인한다)
// 금액은 프로젝트를 볼 수 있는 사람 모두가 본다 (금액 열람 규칙 없음, 2026-11-17 사용자 결정)
export interface ProjectAccess {
  memberRole: ProjectMemberRole | null; // 참여자가 아니면 null (관리자로 들어온 경우)
  isAdmin: boolean;
  canManage: boolean; // 책임자·관리자: 수정·참여자 관리·삭제·부재 담당 교체
}

// GET /projects/:id/partners 한 행 - 협력사(하청기업). 금액은 Decimal이라 문자열로 온다("12000000")
export interface ProjectPartner {
  id: number;
  projectId: number;
  clientId: number;
  client: { id: number; name: string; businessNo: string | null; deleted: boolean };
  workScope: string | null;
  contractAmount: string | null; // 원, 공급가액(부가세 별도)
  taxType: QuoteTaxType;
  vatRate: string; // % ("10", "3.3")
  vatAmount: string | null; // 서버 계산 (금액이 없으면 null)
  totalAmount: string | null;
  startDate: string | null;
  endDate: string | null;
  contacts: ProjectPartnerContact[]; // 직접 기재한 담당자 (여러 명, 입력 순서)
  createdAt: string;
}

export interface ProjectPartnerContact {
  id: number;
  name: string;
  role: string | null; // 예: PM, 실무, 정산
  hp: string | null;
  email: string | null;
}

// "12000000" → "12,000,000원" (문자열 그대로 자릿수만 끊는다 - 큰 금액도 정밀도 손실 없음)
export function formatAmount(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;
}

// GET /projects/:id
export interface ProjectDetail {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  clientId: number | null;
  client: ProjectClientRef | null;
  members: ProjectMember[];
  taskCounts: Record<ProjectTaskStatus, number>;
  progress: ProjectProgress;
  myAccess: ProjectAccess;
  createdAt: string;
  updatedAt: string;
}

// GET /projects/:id/tasks 한 행 (컬럼 순서 → sortOrder)
export interface ProjectTask {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  status: ProjectTaskStatus;
  assigneeId: number | null;
  assignee: { id: number; name: string; status: string; deleted: boolean } | null;
  assigneeAbsent: boolean; // 담당자가 참여자에서 빠졌거나 퇴사·삭제 → 인수인계 필요
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
}

// GET /projects/my-tasks 한 행
export interface MyTask {
  id: number;
  title: string;
  status: ProjectTaskStatus;
  dueDate: string | null;
  project: { id: number; name: string };
}

// 거래처
export interface ProjectClientContact {
  id: number;
  name: string;
  department: string | null;
  jobTitle: string | null;
  hp: string | null;
  email: string | null;
  memo: string | null;
}

export interface ProjectClient {
  id: number;
  name: string;
  businessNo: string | null; // 숫자 10자리로 저장된다 (화면에서 000-00-00000으로 표시)
  ceoName: string | null;
  address: string | null;
  tel: string | null;
  memo: string | null;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  _count?: { contacts?: number; projects: number; partners: number }; // projects = 발주 프로젝트 수, partners = 협력 프로젝트 수
  deletedBy?: { id: number; name: string | null } | null; // 삭제된 거래처 목록에만
  contacts?: ProjectClientContact[]; // 상세에만
}

// "1234567890" → "123-45-67890"
export function formatBusinessNo(value: string | null | undefined) {
  if (!value) return "-";
  return value.length === 10 ? `${value.slice(0, 3)}-${value.slice(3, 5)}-${value.slice(5)}` : value;
}

// ── 견적서 (docs/design/projects.md 5-1장) ───────────────────────────
// 금액은 Decimal(15,0)이라 문자열로 온다. 표시 상태는 서버가 결재 문서 상태로 계산한다.
export type QuoteTaxType = "TAXABLE" | "EXEMPT";
export type QuoteDisplayStatus = "DRAFT" | "IN_APPROVAL" | "REJECTED" | "CONFIRMED" | "CANCELLED";

export const QUOTE_TAX_LABEL: Record<QuoteTaxType, string> = { TAXABLE: "과세", EXEMPT: "면세" };

// "과세 (부가세 10%)" / "면세" - 부가세율은 직접 입력(기본 10%)
export function formatTax(taxType: QuoteTaxType, vatRate: string) {
  return taxType === "TAXABLE" ? `과세 (부가세 ${vatRate}%)` : "면세";
}
export const QUOTE_STATUS_LABEL: Record<QuoteDisplayStatus, string> = {
  DRAFT: "작성 중",
  IN_APPROVAL: "결재 중",
  REJECTED: "반려",
  CONFIRMED: "확정",
  CANCELLED: "확정 취소",
};

// GET /projects/:id/quotes
export interface QuoteListResult {
  approvalEnabled: boolean; // 켜져 있으면 확정은 결재로 ([결재 요청]), 꺼져 있으면 [확정]
  contractAmount: string; // 확정 버전 합계 = 프로젝트 계약 금액
  quotes: {
    id: number;
    quoteNo: string;
    title: string;
    versionCount: number;
    latest: { id: number; version: number; status: QuoteDisplayStatus; taxType: QuoteTaxType; quoteDate: string; totalAmount: string };
    createdAt: string;
  }[];
}

export interface QuoteItem {
  id: number;
  sortOrder: number;
  name: string;
  spec: string | null;
  quantity: number;
  unitPrice: string;
  amount: string;
  note: string | null;
}

export interface QuoteVersion {
  id: number;
  version: number;
  isLatest: boolean;
  displayStatus: QuoteDisplayStatus;
  taxType: QuoteTaxType;
  vatRate: string; // %
  quoteDate: string;
  validUntil: string | null;
  clientId: number | null;
  clientName: string;
  clientBusinessNo: string | null;
  clientCeoName: string | null;
  clientAddress: string | null;
  clientTel: string | null;
  contactId: number | null;
  contactName: string | null;
  contactDepartment: string | null;
  contactJobTitle: string | null;
  contactHp: string | null;
  contactEmail: string | null;
  supplyAmount: string;
  vatAmount: string;
  totalAmount: string;
  note: string | null;
  approvalDocument: { id: number; status: string | null } | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

// GET /projects/:id/quotes/:quoteId (버전은 최신 순)
export interface QuoteDetail {
  id: number;
  quoteNo: string;
  title: string;
  projectId: number;
  projectName: string;
  approvalEnabled: boolean;
  versions: QuoteVersion[];
  createdAt: string;
}

// ── 매출 (docs/design/projects.md 5-2장) ───────────────────────────
// 청구 상태는 저장값, 수금 상태는 서버가 수금 합계로 계산한다. 금액은 문자열(Decimal).
export type SaleStatus = "PLANNED" | "BILLED" | "CANCELLED";
export type SalePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { PLANNED: "청구 예정", BILLED: "청구", CANCELLED: "취소" };
export const PAYMENT_STATUS_LABEL: Record<SalePaymentStatus, string> = { UNPAID: "미수", PARTIAL: "부분 수금", PAID: "수금 완료" };

export interface SalePayment {
  id: number;
  paidDate: string;
  amount: string;
  memo: string | null;
  createdAt: string;
}

export interface ProjectSale {
  id: number;
  projectId: number;
  quoteVersionId: number | null;
  quoteVersion: { id: number; version: number; quote: { id: number; quoteNo: string; title: string } } | null;
  title: string;
  status: SaleStatus;
  taxType: QuoteTaxType;
  vatRate: string; // %
  supplyAmount: string;
  vatAmount: string;
  totalAmount: string;
  plannedDate: string | null;
  billedDate: string | null; // 매출 기준일
  taxInvoiceNo: string | null;
  memo: string | null;
  paidAmount: string;
  paymentStatus: SalePaymentStatus;
  payments: SalePayment[];
  files: import("./file").FileInfo[]; // 세금계산서 파일
  createdAt: string;
}

// 청구할 수 있는 확정 견적 (청구 잔액 포함)
export interface ConfirmedQuoteBalance {
  id: number; // 견적 버전 id
  version: number;
  taxType: QuoteTaxType;
  vatRate: string; // %
  totalAmount: string;
  billedAmount: string;
  remaining: string;
  quote: { id: number; quoteNo: string; title: string };
}

export interface SaleListResult {
  summary: { billedTotal: string; plannedTotal: string; paidTotal: string; outstanding: string };
  monthlySales: MonthlyAmount[]; // 최근 12개월, 청구일 기준 (부가세 포함)
  confirmedQuotes: ConfirmedQuoteBalance[];
  sales: ProjectSale[];
}

// ── 예산 (docs/design/projects.md 5-3장) ───────────────────────────
// 예산과 지출은 공급가액으로 비교한다. 예산을 넘어도 저장되고 화면에 경고만 한다. 금액은 문자열(Decimal).
export interface MonthlyAmount {
  month: string; // "2026-11"
  amount: string;
}

export interface BudgetCategory {
  id: number;
  name: string;
}

export interface BudgetCategorySummary {
  categoryId: number;
  name: string;
  deleted: boolean; // 관리자가 숨긴 항목 (이미 쓴 기록에는 이름이 남는다)
  budgetAmount: string;
  spentAmount: string;
  remaining: string; // 넘으면 음수
  over: boolean;
}

export interface BudgetPartnerSummary {
  partnerId: number;
  name: string;
  removed: boolean; // 프로젝트에서 빠진 협력사 (지급 기록이 있어 남아 있음)
  contractAmount: string | null;
  paidAmount: string; // 공급가액 (계약 금액과 비교하는 기준)
  paidTotalAmount: string; // 실제 지급액 (부가세 포함)
  remaining: string | null;
}

export interface BudgetWarning {
  budgetAmount: string;
  spentAmount: string;
  overAmount: string;
}

export interface ProjectExpense {
  id: number;
  categoryId: number;
  partnerId: number | null;
  title: string;
  expenseDate: string;
  taxType: QuoteTaxType;
  vatRate: string; // %
  supplyAmount: string;
  vatAmount: string;
  totalAmount: string;
  memo: string | null;
  category: { id: number; name: string; deleted: boolean };
  partner: { id: number; deleted: boolean; client: { name: string } } | null;
  files: import("./file").FileInfo[]; // 증빙 파일
  createdAt: string;
}

// GET /projects/:id/budgets
export interface ProjectBudgetResult {
  summary: { budgetTotal: string; spentTotal: string; remaining: string };
  categories: BudgetCategorySummary[];
  partners: BudgetPartnerSummary[];
  monthlyExpenses: MonthlyAmount[];
  expenses: ProjectExpense[];
}

// GET /projects/stats (과제 관리 관리자)
export interface ProjectCompanyStats {
  monthlySales: MonthlyAmount[];
  monthlyExpenses: MonthlyAmount[];
  topClients: { clientId: number; name: string; amount: string }[];
  categories: BudgetCategorySummary[];
}

// GET /projects/stats/filters (과제 관리 관리자)
export interface ProjectStatsFilters {
  years: number[]; // 데이터가 있는 연도 + 올해 (최근 연도부터)
  projects: { id: number; name: string; clientId: number | null }[];
  clients: { id: number; name: string; deleted: boolean }[];
}
