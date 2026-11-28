//* 페이지 목록 응답의 meta (Swagger 문서용, PaginatePage 결과와 같은 형태)
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
