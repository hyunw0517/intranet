//* 페이지 목록 응답의 meta (문서용 클래스, PaginatePage의 PagePaginationResult.meta와 같은 형태)
// - 목록 응답 클래스는 모듈별로 두고(예: UserListResponse), meta만 이 클래스를 같이 쓴다. (docs/api.md 3.4)
export class PageMetaResponse {
    /** 현재 페이지 (1부터) */
    page: number;

    /** 페이지 크기 */
    take: number;

    /** 전체 개수 */
    total: number;

    /** 전체 페이지 수 */
    totalPages: number;

    /** 다음 페이지가 있는지 */
    hasNext: boolean;

    /** 이전 페이지가 있는지 */
    hasPrevious: boolean;
}
