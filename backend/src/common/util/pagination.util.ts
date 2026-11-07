import { PagePaginationDto } from "../dto/page-pagination.dto";
import { CursorPaginationDto } from "../dto/cursor-pagination.dto";
import { PagePaginationResult, CursorPaginationResult } from "../interface/pagination-result.interface";

// 조회(findMany, count)는 Service에서 직접 실행하고, 여기서는 조회 인자와 응답 형식만 만든다.
// 정렬(orderBy)은 Service에서 지정한다. 정렬 컬럼은 도메인 DTO의 enum으로 제한하고,
// 마지막에 { id: order }를 붙여 정렬 값이 같은 행의 순서를 고정한다. (없으면 페이지·커서 경계에서 누락·중복)

//! Page 기반 Pagination

//* 페이지 목록 조회: 목록 + 전체 개수를 병렬 조회해 페이지 응답으로 반환
// - Service에서는 이 함수만 사용한다. (PageArgs, PageResult는 내부용)
// - Prisma delegate(this.prisma.users)를 받으면 select에 따른 반환 타입 추론이 깨지므로 조회는 콜백으로 받는다.
// - findPage는 받은 skip, take를 findMany에 펼쳐 넣는다. 메모리 정렬처럼 DB 페이징이 아닌 경우 slice에 사용한다.
// ex) return PaginatePage( query,
//       (page) => this.prisma.users.findMany({ select, where, orderBy, ...page }),
//       () => this.prisma.users.count({ where }),
//     );
export async function PaginatePage<T>(
    dto: PagePaginationDto,
    findPage: ( page: { skip: number; take: number } ) => Promise<T[]>,
    count: () => Promise<number>,
): Promise<PagePaginationResult<T>> {
    const [data, total] = await Promise.all([ findPage( PageArgs( dto ) ), count() ]);
    return PageResult( data, total, dto );
}

//* page, take를 Prisma의 skip, take로 변환
function PageArgs( dto: PagePaginationDto ) {
    return {
        skip: ( dto.page - 1 ) * dto.take,
        take: dto.take,
    };
}

//* 결과 반환: 조회 결과 + 전체 개수 + 페이지 정보
function PageResult<T>(
    data: T[],
    total: number,
    dto: PagePaginationDto
): PagePaginationResult<T> {
    const totalPages = Math.ceil( total / dto.take );

    return {
        data,
        meta: {
            page: dto.page,
            take: dto.take,
            total,
            totalPages,
            hasNext: dto.page < totalPages,
            hasPrevious: dto.page > 1,
        },
    };
}

//! Cursor 기반 Pagination
// cursor-> 마지막으로 받은 행의 id. 정렬·검색 조건이 바뀌면 프론트에서 cursor 없이 다시 요청(초기화).

//* findMany 안에서 호출: cursor, take를 Prisma의 cursor, skip, take로 변환
// ex) ...CursorArgs( dto )
export function CursorArgs( dto: CursorPaginationDto ) {
    // 반환 형태를 하나로 유지해야 Prisma findMany의 타입 추론 가능. (커서 유무에 따라 {}를 반환하면 실패)
    return {
        cursor: dto.cursor !== undefined ? { id: dto.cursor } : undefined,
        skip: dto.cursor !== undefined ? 1 : 0, // 커서 행 자체는 제외
        take: dto.take + 1,                     // 1개 더 조회해서 다음 데이터 존재 여부 확인
    };
}

//* 결과 반환: 조회 결과(초과분 1개 제외) + 다음 커서 정보
// 커서는 문자열로 응답 (BigInt id일 경우 JSON 직렬화 문제)
export function CursorResult<T extends { id: number | bigint }>(
    rows: T[],
    dto: CursorPaginationDto
): CursorPaginationResult<T> {
    const hasNext = rows.length > dto.take;
    const data = hasNext ? rows.slice( 0, dto.take ) : rows;

    return {
        data,
        meta: {
            take: dto.take,
            nextCursor: hasNext ? String( data[data.length - 1].id ) : null,
            hasNext,
        },
    };
}
