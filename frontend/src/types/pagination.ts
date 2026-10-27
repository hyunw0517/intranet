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
