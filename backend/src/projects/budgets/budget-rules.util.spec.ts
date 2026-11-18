//! budget-rules.util.ts 단위 테스트 (최근 달 목록, 달별 합계, 항목별 예산 대비 지출, 초과 경고)
// DB를 쓰지 않는다. 규칙은 docs/design/projects.md 5-3장.

import { Prisma } from 'src/generated/prisma/client';
import { budgetWarning, fillMonths, monthOf, monthRange, recentMonths, summarizeCategories, yearMonths } from './budget-rules.util';

const D = ( v: number ) => new Prisma.Decimal( v );
const cat = ( id: number, name = `항목${id}`, deleted = false ) => ({ id, name, deleted });

describe('recentMonths - 최근 N개월', () => {
    it('해를 넘겨 오래된 달부터 기준 달까지', () => {
        expect( recentMonths( '2026-02-15', 4 ) ).toEqual([ '2025-11', '2025-12', '2026-01', '2026-02' ]);
    });
    it('기본 12개월, 말일이 기준이어도 달을 건너뛰지 않는다', () => {
        const months = recentMonths( '2026-03-31' );
        expect( months ).toHaveLength( 12 );
        expect( months[0] ).toBe( '2025-04' );
        expect( months ).toContain( '2026-02' );
    });
});

describe('yearMonths·monthRange - 연도 조회 범위', () => {
    it('한 해는 1~12월', () => {
        const months = yearMonths( 2025 );
        expect( [ months[0], months[11], months.length ] ).toEqual([ '2025-01', '2025-12', 12 ]);
    });
    it('끝은 마지막 달의 다음 달 1일 (해를 넘겨도)', () => {
        expect( monthRange( yearMonths( 2025 ) ) ).toEqual({ from: '2025-01-01', to: '2026-01-01' });
        expect( monthRange( [ '2025-12', '2026-01', '2026-02' ] ) ).toEqual({ from: '2025-12-01', to: '2026-03-01' });
    });
});

describe('fillMonths - 달별 합계', () => {
    it('없는 달은 0, 같은 달은 더하고, 범위 밖은 버린다', () => {
        const rows = fillMonths( [ '2026-10', '2026-11' ], [
            { month: '2026-11', amount: D( 100 ) }, { month: '2026-11', amount: '50' }, { month: '2026-09', amount: D( 999 ) },
        ] );
        expect( rows.map( ( r ) => [ r.month, r.amount.toString() ] ) ).toEqual([ [ '2026-10', '0' ], [ '2026-11', '150' ] ]);
    });
    it('DATE 컬럼의 달', () => {
        expect( monthOf( new Date( '2026-11-30T00:00:00.000Z' ) ) ).toBe( '2026-11' );
    });
});

describe('summarizeCategories - 항목별 예산 대비 지출', () => {
    it('예산과 지출을 항목별로 합치고 초과를 표시한다 (같으면 초과 아님)', () => {
        const rows = summarizeCategories(
            [ { amount: D( 1000 ), category: cat( 1 ) }, { amount: D( 500 ), category: cat( 2 ) } ],
            [ { supplyAmount: D( 400 ), category: cat( 1 ) }, { supplyAmount: D( 600 ), category: cat( 1 ) }, { supplyAmount: D( 501 ), category: cat( 2 ) } ],
        );
        expect( rows.map( ( r ) => [ r.categoryId, r.spentAmount.toString(), r.remaining.toString(), r.over ] ) ).toEqual([
            [ 1, '1000', '0', false ], [ 2, '501', '-1', true ],
        ]);
    });
    it('예산 없이 쓴 항목은 초과, 숨긴 항목도 이름이 남는다', () => {
        const [ row ] = summarizeCategories( [], [ { supplyAmount: D( 10 ), category: cat( 3, '폐지 항목', true ) } ] );
        expect( row ).toMatchObject({ name: '폐지 항목', deleted: true, over: true });
        expect( row.budgetAmount.toString() ).toBe( '0' );
    });
});

describe('budgetWarning - 초과 경고', () => {
    it('넘을 때만 초과 금액을 알려 준다', () => {
        expect( budgetWarning( D( 100 ), D( 100 ) ) ).toBeNull();
        expect( budgetWarning( D( 100 ), D( 130 ) )?.overAmount.toString() ).toBe( '30' );
    });
});
