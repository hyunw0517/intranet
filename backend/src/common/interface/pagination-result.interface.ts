export interface PagePaginationResult<T> {
    data: T[];
    meta: {
        page: number;
        take: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
    };
}

export interface CursorPaginationResult<T> {
    data: T[];
    meta: {
        take: number;
        nextCursor: string | null;
        hasNext: boolean;
    };
}