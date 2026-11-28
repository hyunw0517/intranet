import { Prisma } from "src/generated/prisma/client";

//! 예산·그래프 순수 규칙 (DB 없이 단위 테스트)

export const STATS_MONTHS = 12; // 그래프는 최근 12개월

const ZERO = () => new Prisma.Decimal( 0 );

//* 기준일이 속한 달까지 최근 N개월 ("2026-11" 형식, 오래된 달부터)
export function recentMonths( today: string, count = STATS_MONTHS ): string[] {
    const [ year, month ] = today.split( '-' ).map( Number );
    return Array.from( { length: count }, ( _, i ) => {
        const d = new Date( Date.UTC( year, month - 1 - ( count - 1 - i ), 1 ) );
        return d.toISOString().slice( 0, 7 );
    });
}

//* 한 해의 1~12월 ("2025-01" ~ "2025-12")
export function yearMonths( year: number ): string[] {
    return Array.from( { length: 12 }, ( _, i ) => `${year}-${String( i + 1 ).padStart( 2, '0' )}` );
}

//* 달 목록의 조회 범위 [from, to) - to는 마지막 달의 다음 달 1일
export function monthRange( months: string[] ) {
    const [ year, month ] = months[ months.length - 1 ].split( '-' ).map( Number );
    return { from: `${months[0]}-01`, to: new Date( Date.UTC( year, month, 1 ) ).toISOString().slice( 0, 10 ) };
}

//* DATE 컬럼(UTC 자정으로 읽힌다)의 달
export const monthOf = ( date: Date ) => date.toISOString().slice( 0, 7 );

//* 달별 합계 - 값이 없는 달은 0으로 채우고, 범위 밖의 달은 버린다
export function fillMonths( months: string[], rows: { month: string; amount: Prisma.Decimal | number | string }[] ) {
    const sums = new Map( months.map( ( m ) => [ m, ZERO() ] ) );
    for ( const row of rows ) {
        const sum = sums.get( row.month );
        if ( sum ) sums.set( row.month, sum.add( row.amount ) );
    }
    return months.map( ( month ) => ({ month, amount: sums.get( month )! }) );
}

type CategoryRef = { id: number; name: string; deleted: boolean };

//* 항목별 예산 대비 지출 (공급가액 기준, 예산 없이 쓴 금액도 초과로 본다)
export function summarizeCategories(
    budgets: { amount: Prisma.Decimal; category: CategoryRef }[],
    expenses: { supplyAmount: Prisma.Decimal; category: CategoryRef }[],
) {
    const rows = new Map<number, { category: CategoryRef; budget: Prisma.Decimal; spent: Prisma.Decimal }>();
    const row = ( category: CategoryRef ) => {
        const found = rows.get( category.id ) ?? { category, budget: ZERO(), spent: ZERO() };
        rows.set( category.id, found );
        return found;
    };
    for ( const b of budgets ) { const r = row( b.category ); r.budget = r.budget.add( b.amount ); }
    for ( const e of expenses ) { const r = row( e.category ); r.spent = r.spent.add( e.supplyAmount ); }

    return [ ...rows.values() ]
        .sort( ( a, b ) => a.category.id - b.category.id )
        .map( ( { category, budget, spent } ) => ({
            categoryId: category.id,
            name: category.name,
            deleted: category.deleted,
            budgetAmount: budget,
            spentAmount: spent,
            remaining: budget.sub( spent ),
            over: spent.gt( budget ),
        }) );
}

//* 예산 초과 경고 (저장은 막지 않는다) - 넘지 않았으면 null
export function budgetWarning( budgetAmount: Prisma.Decimal, spentAmount: Prisma.Decimal ) {
    if ( spentAmount.lte( budgetAmount ) ) return null;
    return { budgetAmount, spentAmount, overAmount: spentAmount.sub( budgetAmount ) };
}
