// 조직(부서·직급·직책) 공통 타입 (관리자 화면, 회원 정보, 이후 게시판 권한 등에서 사용)

// 응답 안에 포함되는 { id, name } 형태의 참조 (회원의 직급, 소속 부서·직책 등)
export interface NamedRef {
  id: number;
  name: string;
}

// GET /departments → 트리 순서(상위 → 하위)의 평평한 목록 (백엔드 toTreeList)
export interface Department {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  sortOrder: number;
  depth: number; // 최상위 0부터
  path: string; // 최상위부터 자기까지의 이름 (구분자 /)
}

// GET /positions, GET /job-titles 항목 (화면에서 쓰는 필드만 정의)
export interface Position {
  id: number;
  name: string;
  sortOrder: number;
}

export interface JobTitle {
  id: number;
  name: string;
  sortOrder: number;
}

// 회원 소속 1건 (UserDepartment: 부서 + 직책 + 대표 소속 여부)
export interface UserDepartmentItem {
  id: number;
  isPrimary: boolean;
  department: NamedRef;
  jobTitle: NamedRef | null;
}
