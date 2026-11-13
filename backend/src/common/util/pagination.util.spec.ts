//! pagination.util.ts 단위 테스트
// 목록 API(회원·게시글·알림 등)가 공통으로 쓰는 페이지네이션 계산이 맞는지 확인한다.
// - 페이지 기반(PaginatePage): "3페이지 / 20개씩" → DB의 skip·take로 바꾸고, 전체 개수로 페이지 정보(totalPages, hasNext...)를 만든다.
// - 커서 기반(CursorArgs, CursorResult): "마지막으로 받은 id 다음부터 20개" → take + 1개를 조회해서 다음 데이터가 있는지 판단한다.
// DB를 쓰지 않는다. 조회 함수 자리에 가짜 함수(jest.fn, Promise.resolve)를 넣고 계산 결과만 비교한다.

import { CursorArgs, CursorResult, PaginatePage } from './pagination.util';
import { PagePaginationDto } from '../dto/page-pagination.dto';
import { CursorPaginationDto } from '../dto/cursor-pagination.dto';

// DTO는 클래스지만 테스트에서는 값만 필요하므로 객체로 만든다.
const pageDto = ( page: number, take: number ) => ({ page, take }) as PagePaginationDto;
const cursorDto = ( take: number, cursor?: number ) => ({ take, cursor }) as CursorPaginationDto;

//* 페이지 기반: 요청 page·take → skip·take 변환 + 응답 meta 계산
describe('PaginatePage (페이지 기반)', () => {
    // 3페이지(20개씩)면 앞의 2페이지 = 40개를 건너뛰어야 한다. (skip = (page - 1) * take)
    // jest.fn()은 "어떤 인자로 호출됐는지" 기록하는 가짜 함수 → findMany에 실제로 넘어갈 값을 확인한다.
    it('page·take를 skip·take로 바꿔 조회 함수에 넘긴다', async () => {
        const findPage = jest.fn().mockResolvedValue([]);

        await PaginatePage( pageDto( 3, 20 ), findPage, () => Promise.resolve( 0 ) );

        expect( findPage ).toHaveBeenCalledWith({ skip: 40, take: 20 });
    });

    // 경계값: 데이터가 하나도 없을 때 totalPages가 0이고, 다음·이전 버튼이 모두 비활성이어야 한다.
    it('total이 0이면 totalPages 0, 다음·이전 페이지 없음', async () => {
        const result = await PaginatePage( pageDto( 1, 20 ), () => Promise.resolve( [] ), () => Promise.resolve( 0 ) );

        expect( result.meta ).toEqual({ page: 1, take: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false });
    });

    // 경계값: 40개 / 20개씩 = 정확히 2페이지. 2페이지가 마지막이므로 "다음 페이지 있음"이 되면 안 된다.
    // (나눗셈 올림을 잘못 쓰면 빈 3페이지가 생기는 실수가 나기 쉬운 곳)
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
    // 첫 요청은 커서가 없다 → 처음부터 조회. take + 1개(21개)를 조회하는 이유: 1개가 더 오면 다음 페이지가 있다는 뜻.
    it('첫 요청(cursor 없음)은 커서 없이 take + 1개를 조회한다', () => {
        expect( CursorArgs( cursorDto( 20 ) ) ).toEqual({ cursor: undefined, skip: 0, take: 21 });
    });

    // Prisma의 cursor는 그 행부터 포함해서 조회한다. 커서 행(105)은 이전 페이지에서 이미 받았으므로 skip: 1로 뺀다.
    it('cursor가 있으면 커서 행 자체는 건너뛴다', () => {
        expect( CursorArgs( cursorDto( 20, 105 ) ) ).toEqual({ cursor: { id: 105 }, skip: 1, take: 21 });
    });
});

//* 커서 기반 응답: 조회 결과(take + 1개까지) → 화면에 줄 data + 다음 커서
describe('CursorResult (커서 기반 응답)', () => {
    const rows = ( ...ids: number[] ) => ids.map( ( id ) => ({ id }) );

    // 3개씩 요청 → 4개가 왔다 = 다음 페이지가 있음. 4번째(7)는 응답에서 빼고, 다음 요청의 커서는 마지막으로 준 행(8).
    it('take + 1개를 받으면 초과분을 빼고 마지막 행 id를 다음 커서로 준다', () => {
        const result = CursorResult( rows( 10, 9, 8, 7 ), cursorDto( 3 ) );

        expect( result.data ).toEqual( rows( 10, 9, 8 ) );
        expect( result.meta ).toEqual({ take: 3, nextCursor: '8', hasNext: true });
    });

    // 3개씩 요청 → 3개 이하가 왔다 = 마지막 페이지. 프론트는 nextCursor가 null이면 [더 보기]를 숨긴다.
    it('take개 이하이면 다음 페이지가 없다', () => {
        const result = CursorResult( rows( 10, 9, 8 ), cursorDto( 3 ) );

        expect( result.data ).toHaveLength( 3 );
        expect( result.meta ).toEqual({ take: 3, nextCursor: null, hasNext: false });
    });

    // 경계값: 빈 결과에서 data[-1].id에 접근하다 오류가 나지 않는지
    it('결과가 없으면 빈 목록, 다음 커서 없음', () => {
        const result = CursorResult( [], cursorDto( 3 ) );

        expect( result.data ).toEqual( [] );
        expect( result.meta.nextCursor ).toBeNull();
    });

    // 알림 id는 BigInt다. BigInt는 JSON.stringify가 실패하므로 커서를 문자열로 바꿔 응답해야 한다.
    // 9007199254740993은 Number로 바꾸면 값이 틀어지는(정밀도 한계) 큰 수 → 문자열 변환이 정확한지도 함께 확인
    it('BigInt id도 문자열 커서로 바꾼다 (JSON 직렬화 대비)', () => {
        const result = CursorResult( [ { id: 9007199254740993n }, { id: 2n } ], cursorDto( 1 ) );

        expect( result.meta.nextCursor ).toBe( '9007199254740993' );
    });
});
