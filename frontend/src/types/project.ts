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

// GET /projects 한 행
export interface ProjectListItem {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  clientId: number | null;
  client: ProjectClientRef | null;
  managers: { id: number; name: string }[];
  memberCount: number;
  progress: ProjectProgress;
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
  contractAmount: string | null; // 원, 부가세 별도
  startDate: string | null;
  endDate: string | null;
  contactName: string | null;
  contactHp: string | null;
  contactEmail: string | null;
  createdAt: string;
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
