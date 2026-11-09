// 백엔드 Page 기반 페이지네이션 응답 (common/util/pagination.util.ts의 PageResult)
export interface PageMeta {
  page: number;
  take: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PageResult<T> {
  data: T[];
  meta: PageMeta;
}

// 백엔드 Cursor 기반 페이지네이션 응답 (CursorResult) - nextCursor는 마지막 행의 id(문자열, BigInt id 대비)
export interface CursorMeta {
  take: number;
  nextCursor: string | null;
  hasNext: boolean;
}

export interface CursorResult<T> {
  data: T[];
  meta: CursorMeta;
}
