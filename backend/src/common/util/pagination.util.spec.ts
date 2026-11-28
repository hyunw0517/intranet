//! pagination.util.ts 단위 테스트
// 페이지 기반(PaginatePage)과 커서 기반(CursorArgs, CursorResult) 계산

import { CursorArgs, CursorResult, PaginatePage } from './pagination.util';
import { PagePaginationDto } from '../dto/page-pagination.dto';
import { CursorPaginationDto } from '../dto/cursor-pagination.dto';

const pageDto = ( page: number, take: number ) => ({ page, take }) as PagePaginationDto;
const cursorDto = ( take: number, cursor?: number ) => ({ take, cursor }) as CursorPaginationDto;

//* 페이지 기반: 요청 page·take → skip·take 변환 + 응답 meta 계산
describe('PaginatePage (페이지 기반)', () => {
    // 3페이지(20개씩)면 40개를 건너뛴다
    it('page·take를 skip·take로 바꿔 조회 함수에 넘긴다', async () => {
        const findPage = jest.fn().mockResolvedValue([]);

        await PaginatePage( pageDto( 3, 20 ), findPage, () => Promise.resolve( 0 ) );

        expect( findPage ).toHaveBeenCalledWith({ skip: 40, take: 20 });
    });

    // 데이터가 없으면 totalPages 0, 다음·이전 모두 없음
    it('total이 0이면 totalPages 0, 다음·이전 페이지 없음', async () => {
        const result = await PaginatePage( pageDto( 1, 20 ), () => Promise.resolve( [] ), () => Promise.resolve( 0 ) );

        expect( result.meta ).toEqual({ page: 1, take: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false });
    });

    // 40개 / 20개씩은 정확히 2페이지라 다음 페이지가 없어야 한다
    it('total이 take로 나누어떨어지면 마지막 페이지에서 hasNext는 false', async () => {
        const result = await PaginatePage( pageDto( 2, 20 ), () => Promise.resolve( [] ), () => Promise.resolve( 40 ) );

        expect( result.meta.totalPages ).toBe( 2 );
        expect( result.meta.hasNext ).toBe( false );
        expect( result.meta.hasPrevious ).toBe( true );
    });

    // 41개 / 20개씩 = 2페이지 + 1개 → 3페이지 (Math.ceil 올림 확인)
    it('나머지가 있으면 페이지를 하나 더 센다', async () => {
        const result = await PaginatePage( pageDto( 2, 20 ), () => Promise.resolve( [] ), () => Promise.resolve( 41 ) );

        expect( result.meta.totalPages ).toBe( 3 );
        expect( result.meta.hasNext ).toBe( true );
    });
});

//* 커서 기반 조회 인자: findMany에 펼쳐 넣을 cursor·skip·take
describe('CursorArgs (커서 기반 조회 인자)', () => {
    // 첫 요청은 커서 없이 처음부터, take + 1개를 읽어 다음 페이지가 있는지 본다
    it('첫 요청(cursor 없음)은 커서 없이 take + 1개를 조회한다', () => {
        expect( CursorArgs( cursorDto( 20 ) ) ).toEqual({ cursor: undefined, skip: 0, take: 21 });
    });

    // Prisma cursor는 그 행부터 포함하므로 skip: 1로 뺀다
    it('cursor가 있으면 커서 행 자체는 건너뛴다', () => {
        expect( CursorArgs( cursorDto( 20, 105 ) ) ).toEqual({ cursor: { id: 105 }, skip: 1, take: 21 });
    });
});

//* 커서 기반 응답: 조회 결과(take + 1개까지) → 화면에 줄 data + 다음 커서
describe('CursorResult (커서 기반 응답)', () => {
    const rows = ( ...ids: number[] ) => ids.map( ( id ) => ({ id }) );

    // 3개씩 요청에 4개가 오면 다음 페이지가 있다. 4번째는 빼고 커서는 마지막으로 준 행
    it('take + 1개를 받으면 초과분을 빼고 마지막 행 id를 다음 커서로 준다', () => {
        const result = CursorResult( rows( 10, 9, 8, 7 ), cursorDto( 3 ) );

        expect( result.data ).toEqual( rows( 10, 9, 8 ) );
        expect( result.meta ).toEqual({ take: 3, nextCursor: '8', hasNext: true });
    });

    // 3개 이하가 오면 마지막 페이지라 nextCursor는 null
    it('take개 이하이면 다음 페이지가 없다', () => {
        const result = CursorResult( rows( 10, 9, 8 ), cursorDto( 3 ) );

        expect( result.data ).toHaveLength( 3 );
        expect( result.meta ).toEqual({ take: 3, nextCursor: null, hasNext: false });
    });

    // 빈 결과에서도 오류가 나지 않는지
    it('결과가 없으면 빈 목록, 다음 커서 없음', () => {
        const result = CursorResult( [], cursorDto( 3 ) );

        expect( result.data ).toEqual( [] );
        expect( result.meta.nextCursor ).toBeNull();
    });

    // BigInt id 커서는 문자열로 내려야 한다. Number로 바꾸면 값이 틀어지는 큰 수로 확인
    it('BigInt id도 문자열 커서로 바꾼다 (JSON 직렬화 대비)', () => {
        const result = CursorResult( [ { id: 9007199254740993n }, { id: 2n } ], cursorDto( 1 ) );

        expect( result.meta.nextCursor ).toBe( '9007199254740993' );
    });
});
